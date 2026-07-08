import { Type } from '@openmrs/esm-framework';

export const configSchema = {
  imaging: {
    orderTypeUuid: {
      _type: Type.UUID,
      _description: 'OrderType UUID for radiology / imaging orders',
      _default: 'b4a7c280-369e-4d12-9ce8-18e36783fed6',
    },
    conceptSetUuid: {
      _type: Type.UUID,
      _description: 'Concept set whose members are the orderable imaging examinations',
      _default: '39c6b411-12c7-43f7-afb6-d90c34db6dba',
    },
  },
  procedure: {
    orderTypeUuid: {
      _type: Type.UUID,
      _description: 'OrderType UUID for procedure orders',
      _default: 'b4a7c280-369e-4d12-9ce8-18e36783fed6',
    },
    conceptSetUuid: {
      _type: Type.UUID,
      _description: 'Concept set whose members are the orderable procedures',
      _default: '1a8ce1bd-f6ac-46ef-90a0-fe59bd57cfb5',
    },
    operationCategoryConceptSetUuid: {
      _type: Type.UUID,
      _description: 'Concept set whose members are the operation categories (e.g. Minor, Major)',
      _default: '3840163f-4b04-4ff0-b703-7e9e76769235',
    },
    bodySiteConceptSetUuid: {
      _type: Type.UUID,
      _description: 'Concept set whose members are the selectable body sites',
      _default: 'f6f071d2-e7f9-423c-b042-09a319866890',
    },
  },
  medicalSupply: {
    orderTypeUuid: {
      _type: Type.UUID,
      _description: 'OrderType UUID for medical supply orders',
      _default: 'dab3ab30-2feb-48ec-b4af-8332a0831b49',
    },
    conceptSetUuid: {
      _type: Type.UUID,
      _description: 'Concept set whose members are the orderable medical supplies (empty = freeform concept search)',
      _default: '',
    },
  },
};

export type Config = {
  imaging: { orderTypeUuid: string; conceptSetUuid: string };
  procedure: {
    orderTypeUuid: string;
    conceptSetUuid: string;
    operationCategoryConceptSetUuid: string;
    bodySiteConceptSetUuid: string;
  };
  medicalSupply: { orderTypeUuid: string; conceptSetUuid: string };
};
