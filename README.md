# n8n-nodes-vodafone

This is an n8n community node for downloading Vodafone Germany cable invoices as binary PDF files.

[n8n](https://n8n.io/) is a workflow automation platform.

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n documentation.

## Operations

- Invoice
  - Download the latest invoices from all cable contracts on a Vodafone account

## Credentials

Create a Vodafone API credential with your MeinVodafone username and password.

The password is stored as an encrypted n8n credential value. The node uses it only to perform the Vodafone login flow and does not log credentials, session cookies, tokens, or invoice payloads.

## Usage

Add the Vodafone node to a workflow and choose:

- Resource: `Invoice`
- Operation: `Download`
- Number of Invoices: How many latest invoices to fetch per contract. The default is `1`.
- Binary Property: The output binary property name. The default is `data`.

The node discovers all cable contracts in the account, fetches the newest invoices for each contract, downloads each invoice document, and returns one item per PDF.

Each output item includes invoice and contract metadata in `json` and the PDF in the configured binary property.

## Compatibility

Compatible with n8n community-node projects using `@n8n/node-cli`.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [n8n creating nodes documentation](https://docs.n8n.io/integrations/creating-nodes/overview/)
