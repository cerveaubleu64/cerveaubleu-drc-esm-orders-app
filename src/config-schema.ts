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
    procedureTypeConceptSetUuid: {
      _type: Type.UUID,
      _description: 'Concept set whose members are the procedure types (e.g. Mineure, Majeure)',
      _default: '9e5cf474-84c3-49c4-9e60-aece3db44fe2',
    },
    bodySiteConceptSetUuid: {
      _type: Type.UUID,
      _description: 'Concept set whose members are the selectable body sites',
      _default: '3edb08bb-de40-498c-9c0d-94f98a1ff9f2',
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
    procedureTypeConceptSetUuid: string;
    bodySiteConceptSetUuid: string;
  };
  medicalSupply: { orderTypeUuid: string; conceptSetUuid: string };
};
