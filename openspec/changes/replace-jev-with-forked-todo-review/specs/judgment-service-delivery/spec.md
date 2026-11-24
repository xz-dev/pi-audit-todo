## ADDED Requirements

### Requirement: No judgment service delivery or removal
Loading this package SHALL NOT discover, install, activate, update or uninstall a JEV service or register service diagnostics. It SHALL NOT modify the user's Pi service selections, credentials or pins. An obsolete explicit delivery-entry filter SHALL NOT silently activate the old service functionality.

#### Scenario: Upgrade with or without an independent JEV installation
- **WHEN** a user upgrades and loads this plugin in a managed or direct-file installation
- **THEN** no JEV installation, registration, credentials access or readiness probe is attempted; an independent JEV package remains untouched. Only independently loaded components can expose their own commands.

## REMOVED Requirements

### Requirement: First eligible load registers an unpinned independent service
**Reason**: Maintenance has no JEV dependency.
**Migration**: Load the maintenance entry only; no replacement service installation is needed.

### Requirement: Loaded audit resources keep their commands discoverable
**Reason**: There is no audit-owned service resource or service command.
**Migration**: Remove obsolete delivery-entry filters; keep the maintenance entry if desired.

### Requirement: Native service updates are independent of audit revisions
**Reason**: This package no longer delivers a service to update.
**Migration**: Manage independently selected packages through Pi as before.

### Requirement: Registration is scoped and preserves user choices
**Reason**: No registration is needed at any scope.
**Migration**: Leave all existing user and trusted-project service choices untouched.

### Requirement: A newly registered service is usable without duplicate activation
**Reason**: The maintenance plugin does not activate JEV.
**Migration**: Run private maintenance without a JEV handle.

### Requirement: Provisioning respects lifecycle, trust, and process ownership
**Reason**: The provisioning feature is removed entirely.
**Migration**: Use private fork ownership, not a service installer.

### Requirement: Failure reporting distinguishes install, registration, and activation
**Reason**: No installation phase remains in this package.
**Migration**: Report actual fork or parent-write failures instead.

### Requirement: Documentation explains the independent package lifecycle
**Reason**: Audit installation no longer installs an additional Pi package.
**Migration**: Explain the removal, obsolete filters and preservation of user-owned installations in upgrade documentation.
