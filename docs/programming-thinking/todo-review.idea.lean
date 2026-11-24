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

end TodoReview

def main : IO Unit := IO.println "TODO maintenance thresholds, activity union, and write fences checked."
