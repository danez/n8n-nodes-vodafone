import type { ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class VodafoneApi implements ICredentialType {
  name = 'vodafoneApi';

  displayName = 'Vodafone API';

  icon: Icon = 'file:../icons/vodafone.svg';

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
  ];
}
