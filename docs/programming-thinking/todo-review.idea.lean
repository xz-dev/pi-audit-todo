import Std

set_option autoImplicit false

namespace TodoReview

structure Baseline where
  loops : Nat
  workMs : Nat

inductive Status where
  | pending | inProgress | completed | deleted
  deriving DecidableEq

structure Item where
  revision : Nat
  status : Status
  changedAt : Baseline

structure Review where
  revision : Nat
  acceptedAt : Baseline

def thresholdReached (now origin : Baseline) : Bool :=
  decide (origin.loops + 30 < now.loops ∨ origin.workMs + 1800000 < now.workMs)

def terminal : Status → Bool
  | .completed | .deleted => true
  | _ => false

def reviewDue (item : Item) (last : Option Review) (now : Baseline) : Bool :=
  match last with
  | none => thresholdReached now item.changedAt
  | some review =>
    if review.revision != item.revision then thresholdReached now item.changedAt
    else if terminal item.status then false
    else thresholdReached now ⟨max item.changedAt.loops review.acceptedAt.loops,
      max item.changedAt.workMs review.acceptedAt.workMs⟩

def activations (before after : List Nat) : List Nat :=
  if after.length ≥ 2 then after.filter fun id => !before.contains id else []

structure WriteFence where
  session : Nat
  branch : Nat
  boardGeneration : Nat
  userBoundary : Nat
  taskRevision : Nat
  deriving DecidableEq

def mayWrite (observed current : WriteFence) (evidenceValidated : Bool) : Bool :=
  decide (observed = current) && evidenceValidated

def accrue (elapsed : Nat) (ordinaryBusy : List Bool) (duration : Nat) : Nat :=
  if ordinaryBusy.any id then elapsed + duration else elapsed

-- Strict expiry, a terminal revision reviewed once, and unchanged membership do not dispatch.
 theorem exactBoundaries : thresholdReached ⟨30, 1800000⟩ ⟨0, 0⟩ = false := by decide
 theorem loopExpiry : thresholdReached ⟨31, 0⟩ ⟨0, 0⟩ = true := by decide
 theorem workExpiry : thresholdReached ⟨0, 1800001⟩ ⟨0, 0⟩ = true := by decide
 theorem terminalKeep : reviewDue ⟨3, .deleted, ⟨0, 0⟩⟩ (some ⟨3, ⟨1, 0⟩⟩) ⟨200, 3000000⟩ = false := by decide
 theorem secondActivation : activations [1] [1, 2] = [2] := by decide
 theorem simultaneousActivations : activations [1] [1, 2, 3] = [2, 3] := by decide
 theorem sameCountDifferentItem : activations [1, 2] [1, 3] = [3] := by decide
 theorem overlapCountsOnce : accrue 100 [true, true] 25 = 125 := by decide
 theorem idleDoesNotAge : accrue 100 [false, false] 1800001 = 100 := by decide

-- A branch, generation, revision or user-boundary mismatch never authorizes writeback.
 theorem staleCannotWrite (old current : WriteFence) (stale : old ≠ current) (evidenceValidated : Bool) :
    mayWrite old current evidenceValidated = false := by simp [mayWrite, stale]
 theorem noAuthorityCannotWrite (fence : WriteFence) : mayWrite fence fence false = false := by simp [mayWrite]

-- The accepted checkpoint records both the evidence boundary and scheduling baseline.
-- Record positions are ordered within one branch; relevance is supplied by the reviewer.
structure ActiveCheckpoint where
  evidenceCutoff : Nat
  baseline : Baseline

inductive ActiveDecision where
  | keep (source : Nat) (originalItemObservation : Bool)
  | pause (confirmedWholeItemWait : Bool)
  | unverified

inductive ActiveOutcome where
  | kept (checkpoint : ActiveCheckpoint)
  | movedToPending
  | unverified

-- The owner's live fence and evidence checks decide which effects are permitted.
def assessActive (observed current : WriteFence) (previous : ActiveCheckpoint)
    (anchor : Nat) (now : Baseline) : ActiveDecision → ActiveOutcome
  | .keep source relevant =>
    if mayWrite observed current (relevant && decide (previous.evidenceCutoff < source ∧ source ≤ anchor))
    then .kept ⟨anchor, now⟩ else .unverified
  | .pause supported => if mayWrite observed current supported then .movedToPending else .unverified
  | .unverified => .unverified

-- Only a successful active KEEP replaces the checkpoint of the current active period.
def keepCheckpoint (previous : ActiveCheckpoint) : ActiveOutcome → ActiveCheckpoint
  | .kept next => next
  | _ => previous

-- Stale evidence cannot renew, and an eligible observation inside the fork can renew.
theorem staleDoesNotRenew (old current : WriteFence) (previous : ActiveCheckpoint)
    (anchor source : Nat) (now : Baseline) (relevant : Bool) (stale : source ≤ previous.evidenceCutoff) :
    assessActive old current previous anchor now (.keep source relevant) = .unverified := by
  simp [assessActive, mayWrite, Nat.not_lt_of_ge stale]

theorem freshCanRenew (fence : WriteFence) (previous : ActiveCheckpoint)
    (anchor source : Nat) (now : Baseline) (later : previous.evidenceCutoff < source) (visible : source ≤ anchor) :
    assessActive fence fence previous anchor now (.keep source true) = .kept ⟨anchor, now⟩ := by
  simp [assessActive, mayWrite, later, visible]

-- Across successive reviews, cached evidence and uncertainty preserve the baseline.
-- A fresh report can renew again; only a confirmed whole-item pause changes its status.
theorem activeReviewIsCorrect (fence : WriteFence) (previous : ActiveCheckpoint)
    (firstSource firstAnchor nextSource nextAnchor : Nat) (firstTime nextTime : Baseline)
    (firstNew : previous.evidenceCutoff < firstSource) (firstVisible : firstSource ≤ firstAnchor)
    (nextNew : firstAnchor < nextSource) (nextVisible : nextSource ≤ nextAnchor) :
    let first := keepCheckpoint previous (assessActive fence fence previous firstAnchor firstTime (.keep firstSource true))
    keepCheckpoint first (assessActive fence fence first nextAnchor nextTime (.keep firstSource true)) = first ∧
    keepCheckpoint first (assessActive fence fence first nextAnchor nextTime .unverified) = first ∧
    assessActive fence fence first nextAnchor nextTime (.keep nextSource true) = .kept ⟨nextAnchor, nextTime⟩ ∧
    assessActive fence fence first nextAnchor nextTime (.pause true) = .movedToPending ∧
    assessActive fence fence first nextAnchor nextTime (.pause false) = .unverified := by
  dsimp only
  rw [freshCanRenew fence previous firstAnchor firstSource firstTime firstNew firstVisible]
  simp [keepCheckpoint, assessActive, mayWrite, Nat.not_lt_of_ge firstVisible, nextNew, nextVisible]

#print axioms activeReviewIsCorrect

-- The whole-attempt gate cannot grant another child after acceptance or revocation.
inductive WholeReviewResult where
  | accepted | failed | cancelled
  deriving DecidableEq

def mayReplaceReview (current : Bool) (attempt : Nat) (result : WholeReviewResult) : Bool :=
  current && decide (attempt < 3) && decide (result = .failed)

-- Replacement inherits unused evidence instead of receiving a new allowance.
def remainingEvidence (spent : Nat) : Nat := 4 - spent

theorem retryReviewIsCorrect (attempt : Nat) :
    mayReplaceReview false attempt .failed = false ∧
    mayReplaceReview true attempt .accepted = false ∧
    mayReplaceReview true attempt .cancelled = false ∧
    mayReplaceReview true 3 .failed = false ∧
    mayReplaceReview true 2 .failed = true ∧
    remainingEvidence 3 = 1 := by
  simp [mayReplaceReview, remainingEvidence]

#print axioms retryReviewIsCorrect

end TodoReview

def main : IO Unit := do
  IO.println "TODO maintenance: fresh evidence renews; stale or unverified reviews do not; confirmed pauses move to pending."
  IO.println "Private review: three whole attempts share four evidence calls; only acceptance may hand off."
