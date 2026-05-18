import {
  NodeApiError,
  NodeConnectionTypes,
  NodeOperationError,
  type ICredentialDataDecryptedObject,
  type ICredentialsDecrypted,
  type ICredentialTestFunctions,
  type IDataObject,
  type IExecuteFunctions,
  type INodeCredentialTestResult,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
  type JsonObject,
} from 'n8n-workflow';
import {
  getInvoiceDocument,
  getInvoiceList,
  getUserInfo,
  login,
  sanitizeFileName,
  testVodafoneCredentials,
} from './GenericFunctions.js';
import type {
  VodafoneCableAccount,
  VodafoneCredentials,
  VodafoneInvoice,
  VodafoneInvoiceDocument,
} from './interfaces.js';

export class Vodafone implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Vodafone',
    name: 'vodafone',
    icon: 'file:../../icons/vodafone.svg',
    group: ['input'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Download Vodafone Germany cable invoices',
    defaults: {
      name: 'Vodafone',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'vodafoneApi',
        required: true,
        testedBy: 'vodafoneApiTest',
      },
    ],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Invoice',
            value: 'invoice',
          },
        ],
        default: 'invoice',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['invoice'],
          },
        },
        options: [
          {
            name: 'Download',
            value: 'download',
            description: 'Download invoices as PDF files',
            action: 'Download invoices',
          },
        ],
        default: 'download',
      },
      {
        displayName: 'Number of Invoices',
        name: 'invoiceCount',
        type: 'number',
        default: 1,
        typeOptions: {
          minValue: 1,
        },
        displayOptions: {
          show: {
            resource: ['invoice'],
            operation: ['download'],
          },
        },
        description:
          'Max number of matching latest invoice PDFs to download per contract',
      },
      {
        displayName: 'Filter by Month/Year',
        name: 'filterByMonthYear',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            resource: ['invoice'],
            operation: ['download'],
          },
        },
        description:
          'Whether to only download invoices whose invoice date matches a month and year',
      },
      {
        displayName: 'Invoice Month',
        name: 'invoiceMonth',
        type: 'number',
        default: 1,
        typeOptions: {
          minValue: 1,
          maxValue: 12,
        },
        displayOptions: {
          show: {
            resource: ['invoice'],
            operation: ['download'],
            filterByMonthYear: [true],
          },
        },
        description:
          'Invoice month to download, from 1 for January to 12 for December',
      },
      {
        displayName: 'Invoice Year',
        name: 'invoiceYear',
        type: 'number',
        default: new Date().getFullYear(),
        typeOptions: {
          minValue: 2000,
        },
        displayOptions: {
          show: {
            resource: ['invoice'],
            operation: ['download'],
            filterByMonthYear: [true],
          },
        },
        description: 'Invoice year to download, for example 2026',
      },
    ],
  };

  methods = {
    credentialTest: {
      async vodafoneApiTest(
        this: ICredentialTestFunctions,
        credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
      ): Promise<INodeCredentialTestResult> {
        return await testVodafoneCredentials.call(this, credential);
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const resource = this.getNodeParameter('resource', itemIndex) as string;
        const operation = this.getNodeParameter(
          'operation',
          itemIndex,
        ) as string;

        if (resource !== 'invoice' || operation !== 'download') {
          throw new NodeOperationError(
            this.getNode(),
            'Unsupported Vodafone operation',
            { itemIndex },
          );
        }

        const invoiceCount = this.getNodeParameter(
          'invoiceCount',
          itemIndex,
        ) as number;
        const filterByMonthYear = this.getNodeParameter(
          'filterByMonthYear',
          itemIndex,
        ) as boolean;
        const invoiceMonth = filterByMonthYear
          ? (this.getNodeParameter('invoiceMonth', itemIndex) as number)
          : undefined;
        const invoiceYear = filterByMonthYear
          ? (this.getNodeParameter('invoiceYear', itemIndex) as number)
          : undefined;

        if (filterByMonthYear) {
          validateMonthYear(this, invoiceMonth, invoiceYear, itemIndex);
        }

        const credentials = (await this.getCredentials(
          'vodafoneApi',
          itemIndex,
        )) as unknown as VodafoneCredentials;
        const session = await login(this, credentials, itemIndex);
        const userInfo = await getUserInfo(this, session, itemIndex);
        const contracts = userInfo.userAccountVBO?.cable ?? [];
        const downloadedBeforeItem = returnData.length;
        const contractSummaries: IDataObject[] = [];

        if (contracts.length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            'No Vodafone cable contracts were found for this account',
            {
              itemIndex,
            },
          );
        }

        for (const contract of contracts) {
          const invoiceList = await getInvoiceList(
            this,
            session,
            contract.id,
            itemIndex,
          );
          const customerId = invoiceList.customerId;

          if (!customerId) {
            throw new NodeOperationError(
              this.getNode(),
              `Vodafone invoice list for contract ${contract.id} did not include a customer ID`,
              { itemIndex },
            );
          }

          const sortedInvoices = [...(invoiceList.invoices ?? [])].sort(
            (a, b) => invoiceTimestamp(b.date) - invoiceTimestamp(a.date),
          );
          const matchingInvoices = filterByMonthYear
            ? sortedInvoices.filter((invoice) =>
                invoiceMatchesMonthYear(
                  invoice.date,
                  invoiceMonth,
                  invoiceYear,
                ),
              )
            : sortedInvoices;
          const selectedDocuments = invoiceDocumentsToDownload(
            matchingInvoices,
            invoiceCount,
          );

          contractSummaries.push({
            contractId: contract.id,
            contractName: contract.name,
            customerId,
            availableInvoices: invoiceList.invoices?.length ?? 0,
            invoicesWithDocuments: sortedInvoices.filter(
              (invoice) => (invoice.documents?.length ?? 0) > 0,
            ).length,
            matchingInvoices: matchingInvoices.length,
            matchingInvoicesWithDocuments: matchingInvoices.filter(
              (invoice) => (invoice.documents?.length ?? 0) > 0,
            ).length,
            matchingDocuments: invoiceDocumentCount(matchingInvoices),
            filterByMonthYear,
            ...(filterByMonthYear
              ? {
                  invoiceMonth,
                  invoiceYear,
                }
              : {}),
            selectedInvoices: new Set(
              selectedDocuments.map(({ invoice }) => invoice),
            ).size,
            selectedDocuments: selectedDocuments.length,
          });

          for (const { invoice, document } of selectedDocuments) {
            const documentId = document.documentId;

            if (!documentId) {
              continue;
            }

            const documentData = await getInvoiceDocument(
              this,
              session,
              customerId,
              documentId,
              itemIndex,
            );

            if (!documentData.data) {
              throw new NodeOperationError(
                this.getNode(),
                `Vodafone invoice document ${documentId} did not include file data`,
                { itemIndex },
              );
            }

            const mimeType = documentData.mime || 'application/pdf';
            const fileName = invoiceFileName(contract.id, invoice, document);
            const binaryData = await this.helpers.prepareBinaryData(
              Buffer.from(documentData.data, 'base64'),
              fileName,
              mimeType,
            );

            returnData.push({
              json: invoiceMetadata(
                contract,
                customerId,
                invoice,
                document,
                documentData.mime,
                fileName,
              ),
              binary: {
                data: binaryData,
              },
              pairedItem: {
                item: itemIndex,
              },
            });
          }
        }

        if (returnData.length === downloadedBeforeItem) {
          returnData.push({
            json: {
              message: 'No Vodafone invoice documents were found to download',
              contracts: contractSummaries,
            },
            pairedItem: {
              item: itemIndex,
            },
          });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            pairedItem: {
              item: itemIndex,
            },
          });
          continue;
        }

        if (error instanceof NodeApiError) {
          throw new NodeApiError(
            this.getNode(),
            error.errorResponse ?? ({ message: error.message } as JsonObject),
            {
              itemIndex,
              httpCode: error.httpCode ?? undefined,
              message: error.message,
              description: error.description ?? undefined,
            },
          );
        }

        if (error instanceof NodeOperationError) {
          throw new NodeOperationError(this.getNode(), error.message, {
            itemIndex,
          });
        }

        throw new NodeOperationError(this.getNode(), error as Error, {
          itemIndex,
        });
      }
    }

    return [returnData];
  }
}

function invoiceTimestamp(date: string | undefined): number {
  if (!date) {
    return 0;
  }

  const timestamp = Date.parse(date);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function validateMonthYear(
  executeFunctions: IExecuteFunctions,
  month: number | undefined,
  year: number | undefined,
  itemIndex: number,
): void {
  if (
    typeof month !== 'number' ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      'Invoice Month must be an integer between 1 and 12',
      { itemIndex },
    );
  }

  if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000) {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      'Invoice Year must be an integer greater than or equal to 2000',
      { itemIndex },
    );
  }
}

function invoiceMatchesMonthYear(
  date: string | undefined,
  month: number | undefined,
  year: number | undefined,
): boolean {
  if (!date || month === undefined || year === undefined) {
    return false;
  }

  const isoDate = date.match(/^(\d{4})-(\d{2})-\d{2}/);

  if (isoDate) {
    return Number(isoDate[1]) === year && Number(isoDate[2]) === month;
  }

  const timestamp = Date.parse(date);

  if (Number.isNaN(timestamp)) {
    return false;
  }

  const parsedDate = new Date(timestamp);

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() + 1 === month
  );
}

function invoiceDocumentCount(invoices: VodafoneInvoice[]): number {
  return invoices.reduce(
    (documentCount, invoice) =>
      documentCount +
      (invoice.documents ?? []).filter((document) => document.documentId)
        .length,
    0,
  );
}

function invoiceDocumentsToDownload(
  invoices: VodafoneInvoice[],
  limit: number,
): Array<{ invoice: VodafoneInvoice; document: VodafoneInvoiceDocument }> {
  const selectedDocuments: Array<{
    invoice: VodafoneInvoice;
    document: VodafoneInvoiceDocument;
  }> = [];

  for (const invoice of invoices) {
    for (const document of invoice.documents ?? []) {
      if (!document.documentId) {
        continue;
      }

      selectedDocuments.push({ invoice, document });

      if (selectedDocuments.length >= limit) {
        return selectedDocuments;
      }
    }
  }

  return selectedDocuments;
}

function invoiceFileName(
  contractId: string,
  invoice: VodafoneInvoice,
  document: VodafoneInvoiceDocument,
): string {
  const invoiceDate = invoice.date ?? 'unknown-date';
  const invoiceNumber =
    invoice.number ?? document.documentId ?? 'unknown-invoice';
  const sanitizedName = sanitizeFileName(
    `vodafone-invoice-${contractId}-${invoiceDate}-${invoiceNumber}`,
  );

  return `${sanitizedName || 'vodafone-invoice'}.pdf`;
}

function invoiceMetadata(
  contract: VodafoneCableAccount,
  customerId: string,
  invoice: VodafoneInvoice,
  document: VodafoneInvoiceDocument,
  mimeType: string | undefined,
  fileName: string,
): IDataObject {
  return {
    contractId: contract.id,
    contractName: contract.name,
    isActiveContract: contract.isActiveContract,
    isDefaultContract: contract.isDefaultContract,
    customerId,
    invoiceNumber: invoice.number,
    invoiceDate: invoice.date,
    dueDate: invoice.dueDate,
    amount: invoice.amount,
    from: invoice.from,
    about: invoice.about,
    documentId: document.documentId,
    documentCategory: document.category,
    documentSubType: document.subType,
    mimeType: mimeType ?? 'application/pdf',
    fileName,
  };
}
