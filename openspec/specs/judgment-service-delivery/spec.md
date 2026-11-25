# Judgment Service Delivery Specification

## Purpose

Provide the judgment service automatically as an independently managed Pi package, so users receive service updates without an audit release while retaining control of package sources, resource filters, and configuration.

## Requirements

### Requirement: No judgment service delivery or removal
Loading this package SHALL NOT discover, install, activate, update or uninstall a JEV service or register service diagnostics. It SHALL NOT modify the user's Pi service selections, credentials or pins. An obsolete explicit delivery-entry filter SHALL NOT silently activate the old service functionality.

#### Scenario: Upgrade with or without an independent JEV installation
- **WHEN** a user upgrades and loads this plugin in a managed or direct-file installation
- **THEN** no JEV installation, registration, credentials access or readiness probe is attempted; an independent JEV package remains untouched. Only independently loaded components can expose their own commands.
