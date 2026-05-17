export interface VodafoneCredentials {
  username: string;
  password: string;
}

export interface OidcTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}

export interface VodafoneSession {
  cookies: Map<string, string>;
  token: OidcTokenResponse;
}

export interface VodafoneUserInfo {
  userAccountVBO?: {
    cable?: VodafoneCableAccount[];
    activeContractCable?: {
      id?: number;
      name?: string;
    };
  };
}

export interface VodafoneOpenIdUserInfo {
  userAssets?: VodafoneUserAsset[];
}

export interface VodafoneUserAsset {
  id?: string;
  name?: string;
  status?: string;
  assetType?: string;
  entityType?: string;
  externalIdentifier?: VodafoneExternalIdentifier[];
  relatedAsset?: VodafoneRelatedAsset[];
  characteristic?: VodafoneCharacteristic[];
}

export interface VodafoneRelatedAsset {
  id?: string;
  status?: string;
  assetType?: string;
  entityType?: string;
  externalIdentifier?: VodafoneExternalIdentifier[];
  characteristic?: VodafoneCharacteristic[];
}

export interface VodafoneExternalIdentifier {
  id?: string;
  owner?: string;
  type?: string;
}

export interface VodafoneCharacteristic {
  name?: string;
  value?: string;
}

export interface VodafoneCableAccount {
  id: string;
  name?: string;
  isActiveContract?: boolean;
  isDefaultContract?: boolean;
  hasCableMail?: boolean;
  subscription?: VodafoneCableSubscription[];
}

export interface VodafoneCableSubscription {
  id?: string;
  activatedDate?: string;
  type?: string;
  displayName?: string;
}

export interface VodafoneInvoiceList {
  customerId?: string;
  invoices?: VodafoneInvoice[];
}

export interface VodafoneInvoice {
  number?: string;
  date?: string;
  amount?: number;
  dueDate?: string;
  from?: string;
  about?: string;
  documents?: VodafoneInvoiceDocument[];
}

export interface VodafoneInvoiceDocument {
  documentId?: string;
  category?: string;
  icon?: string;
  subType?: string;
}

export interface VodafoneDocumentData {
  customerId?: string;
  documentId?: string;
  mime?: string;
  data?: string;
}
