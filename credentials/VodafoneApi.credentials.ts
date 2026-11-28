import type { ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class VodafoneApi implements ICredentialType {
  name = 'vodafoneApi';

  displayName = 'Vodafone API';

  icon: Icon = {
    light: 'file:../icons/vodafone.svg',
    dark: 'file:../icons/vodafone.svg',
  };

  documentationUrl = 'https://github.com/danez/n8n-nodes-vodafone#credentials';

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
