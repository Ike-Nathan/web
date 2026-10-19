# Analytics Events

This document catalogues the telemetry events emitted by the frontend to help understand user behavior and application health. 

## Event Catalogue

| Event Name | Properties | Description |
| :--- | :--- | :--- |
| `contract_created` | `contractId`, `network` | Fired when a user successfully registers a new contract. |
| `contract_deleted` | `contractId` | Fired when a user deletes a contract. |
| `contract_paused` | `contractId` | Fired when a user toggles a contract to the paused state. |
| `contract_resumed` | `contractId` | Fired when a user toggles a contract back to the active state. |
| `test_webhook_sent` | `network` | Fired when a user successfully sends a test payload to their webhook URL. |
| `import_applied` | `count`, `errors` | Fired when a user applies a JSON backup. Tracks the total number of contracts imported and any errors encountered. |
| `network_switched` | `contractId`, `network` | Fired when a user edits an existing contract to point to a different network. |
| `metadata_edit_opened` | `contractId` | Fired when the metadata edit modal is opened. |
| `metadata_edit_saved` | `contractId` | Fired when metadata (label, webhook) edits are successfully saved. |
| `rule_edit_opened` | `contractId`, `ruleCount` | Fired when the rules edit modal is opened. |
| `rule_edit_saved` | `contractId`, `ruleCount` | Fired when rule edits are successfully saved. |
| `rule_edit_cancelled`| `contractId` | Fired when the rules edit modal is closed without saving. |
| `rule_added` | - | Fired from the Rule Builder when a new rule is staged. |
| `rule_removed` | - | Fired from the Rule Builder when a rule is removed. |