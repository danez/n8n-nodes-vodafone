# n8n-nodes-vodafone

This is an n8n community node for downloading Vodafone Germany cable invoices as binary PDF files.

> This project is not affiliated with, endorsed by, sponsored by, or connected to Vodafone in any way.

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
- Filter by Month/Year: Optionally restrict downloads to invoices from a specific invoice month and year.
- Binary Property: The output binary property name. The default is `data`.

The node discovers all cable contracts in the account, fetches the newest invoices for each contract, downloads each invoice document, and returns one item per PDF.

Each output item includes invoice and contract metadata in `json` and the PDF in the configured binary property.

Month/year filters are expression-friendly. For example, if an earlier node
extracts `12.05.2026` from a Vodafone email subject into `invoiceDate`, set:

- Invoice Month: `={{ Number($json.invoiceDate.split('.')[1]) }}`
- Invoice Year: `={{ Number($json.invoiceDate.split('.')[2]) }}`

## Compatibility

Requires n8n `1.116.0` or newer.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [n8n creating nodes documentation](https://docs.n8n.io/integrations/creating-nodes/overview/)
