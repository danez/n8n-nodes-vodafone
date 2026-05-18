import type {
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from 'n8n-workflow';

export class VodafoneApi implements ICredentialType {
  name = 'vodafoneApi';

  displayName = 'Vodafone API';

  icon: Icon = 'file:../icons/vodafone.svg';

  documentationUrl = 'https://github.com/danez/n8n-nodes-vodafone#credentials';

  test: ICredentialTestRequest = {
    request: {
      url: 'https://www.vodafone.de/mint/rest/v60/session/start',
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Content-Type': 'application/json',
      },
      body: {
        authnIdentifier: '={{$credentials.username}}',
        context: '',
        conversation: '',
        credential: '={{$credentials.password}}',
        targetURL: '',
      },
      json: true,
    },
    rules: [
      {
        type: 'responseCode',
        properties: {
          value: 200,
          message: 'Vodafone login failed',
        },
      },
    ],
  };

  properties: INodeProperties[] = [
    {
      displayName: 'Username',
      name: 'username',
      type: 'string',
      default: '',
      required: true,
    },
    {
      displayName: 'Password',
      name: 'password',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: 'aEIoMCae0A933wBL0bLlS6SwSBfkKwM5',
      required: true,
      description:
        'Vodafone app API key used for MeinVodafone API requests. Leave the default unless Vodafone changes it.',
    },
  ];
}
