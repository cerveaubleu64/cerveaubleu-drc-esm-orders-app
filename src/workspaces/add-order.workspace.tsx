import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonSet,
  Form,
  InlineLoading,
  InlineNotification,
  NumberInput,
  Search,
  Select,
  SelectItem,
  Stack,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { ArrowLeft, ArrowRight, ShoppingCartArrowDown, ShoppingCartArrowUp } from '@carbon/react/icons';
import {
  OpenmrsDatePicker,
  showSnackbar,
  useConfig,
  useDebounce,
  useLayoutType,
  Workspace2,
  type Workspace2DefinitionProps,
} from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { useOrderableConcepts, useOrderFrequencies, type OrderableConcept } from '../api/concepts.resource';
import { findConceptPrice, useBillableServices } from '../api/billing.resource';
import { useOutpatientCareSetting } from '../api/orders.resource';
import {
  addBasketItem,
  removeBasketItem,
  useBasketItems,
  GROUPING_BY_KIND,
  type OrderRestType,
  type PathDrcBasketItem,
} from '../order-basket';

// Imaging and Procedure order types are org.openmrs.TestOrder; Medical Supply
// is a plain org.openmrs.Order. The posted `type` must match the REST subclass
// handler for that java class (there is no procedure-specific handler).
const REST_TYPE_BY_KIND: Record<NonNullable<AddOrderWorkspaceProps['kind']>, OrderRestType> = {
  imaging: 'testorder',
  procedure: 'testorder',
  medicalSupply: 'order',
};

export interface AddOrderWorkspaceProps {
  patientUuid?: string;
  /** Which preset within config-schema to use. */
  kind: 'imaging' | 'procedure' | 'medicalSupply';
}

interface OrderFields {
  urgency: 'ROUTINE' | 'STAT' | 'ON_SCHEDULED_DATE';
  scheduledDate?: Date | null;
  laterality?: '' | 'LEFT' | 'RIGHT' | 'BILATERAL';
  orderReason?: string;
  instructions?: string;
  /** Procedure orders only. */
  accessionNumber?: string;
  procedureType?: string;
  bodySite?: string;
  frequency?: string;
  numberOfRepeats?: string;
  commentToFulfiller?: string;
}

function patientUuidFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const m = window.location.pathname.match(/\/patient\/([0-9a-f-]{36})\b/i);
  return m?.[1];
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const AddOrderWorkspace: React.FC<Workspace2DefinitionProps<AddOrderWorkspaceProps, { patientUuid?: string }>> = ({
  closeWorkspace,
  workspaceProps,
  windowProps,
}) => {
  const { t } = useTranslation();
  const isTablet = useLayoutType() === 'tablet';
  const config = useConfig<Config>();

  const patientUuid = windowProps?.patientUuid ?? workspaceProps?.patientUuid ?? patientUuidFromUrl();
  const kind = workspaceProps?.kind;
  const preset = kind ? config[kind] : undefined;
  const grouping = kind ? GROUPING_BY_KIND[kind] : undefined;

  // Imaging and procedure orders are ServiceOrders, so they support clinical
  // fields (order reason, scheduled date) that medical supplies don't.
  const isServiceOrder = kind === 'imaging' || kind === 'procedure';
  const isImaging = kind === 'imaging';
  const isProcedure = kind === 'procedure';
  const procedurePreset = isProcedure ? (preset as Config['procedure']) : undefined;

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query);
  // When set, we show the order form for this concept instead of the results list.
  const [formConcept, setFormConcept] = useState<OrderableConcept | null>(null);
  const [urgency, setUrgency] = useState<OrderFields['urgency']>('ROUTINE');
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [laterality, setLaterality] = useState<'' | 'LEFT' | 'RIGHT' | 'BILATERAL'>('');
  const [orderReason, setOrderReason] = useState('');
  const [instructions, setInstructions] = useState('');
  const [accessionNumber, setAccessionNumber] = useState('');
  const [procedureType, setProcedureType] = useState('');
  const [bodySite, setBodySite] = useState('');
  const [frequency, setFrequency] = useState('');
  const [numberOfRepeats, setNumberOfRepeats] = useState('');
  const [commentToFulfiller, setCommentToFulfiller] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Procedure-only option lists (hooks are no-ops when the UUIDs are undefined).
  const { concepts: procedureTypeOptions } = useOrderableConcepts(procedurePreset?.procedureTypeConceptSetUuid, '');
  const { concepts: bodySiteOptions } = useOrderableConcepts(procedurePreset?.bodySiteConceptSetUuid, '');
  const { frequencies } = useOrderFrequencies();
  const { services: billableServices, isLoading: billablesLoading } = useBillableServices();
  const noPriceConfigured = !!formConcept && !billablesLoading && !findConceptPrice(billableServices, formConcept.uuid);

  const resetFormFields = useCallback(() => {
    setUrgency('ROUTINE');
    setScheduledDate(null);
    setLaterality('');
    setOrderReason('');
    setInstructions('');
    setAccessionNumber('');
    setProcedureType('');
    setBodySite('');
    setFrequency('');
    setNumberOfRepeats('');
    setCommentToFulfiller('');
  }, []);

  const closeForm = useCallback(() => {
    setFormConcept(null);
    resetFormFields();
  }, [resetFormFields]);

  const { concepts, isLoading: conceptsLoading } = useOrderableConcepts(preset?.conceptSetUuid, debouncedQuery);
  const { careSettingUuid, isLoading: careSettingLoading } = useOutpatientCareSetting();
  const basketItems = useBasketItems(patientUuid, grouping ?? '');

  // Concept sets return their full member list up front, so filter client-side;
  // free-text searches are already filtered server-side (filter is a no-op).
  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return concepts;
    return concepts.filter((c) => c.display.toLowerCase().includes(q));
  }, [concepts, debouncedQuery]);

  const formReady = !careSettingLoading;

  const missingContext = useMemo(() => {
    if (!formReady) return null;
    if (!patientUuid) return t('noPatientContext', 'No patient context available.');
    if (!careSettingUuid) return t('noCareSetting', 'Could not find an Outpatient care setting.');
    return null;
  }, [formReady, patientUuid, careSettingUuid, t]);

  const buildItem = useCallback(
    (concept: OrderableConcept, fields?: OrderFields): PathDrcBasketItem => ({
      action: 'NEW',
      display: concept.display,
      concept: { uuid: concept.uuid, display: concept.display },
      instructions: fields?.instructions?.trim() || undefined,
      urgency: fields?.urgency ?? 'ROUTINE',
      scheduledDate:
        fields?.urgency === 'ON_SCHEDULED_DATE' && fields?.scheduledDate
          ? fields.scheduledDate.toISOString()
          : undefined,
      laterality: isImaging && fields?.laterality ? fields.laterality : undefined,
      orderReasonNonCoded: isServiceOrder && !isProcedure ? fields?.orderReason?.trim() || undefined : undefined,
      accessionNumber: isProcedure && fields?.accessionNumber?.trim() ? fields.accessionNumber.trim() : undefined,
      orderReason: isProcedure && fields?.procedureType ? fields.procedureType : undefined,
      specimenSource: isProcedure && fields?.bodySite ? fields.bodySite : undefined,
      commentToFulfiller: isProcedure && fields?.commentToFulfiller?.trim() ? fields.commentToFulfiller.trim() : undefined,
      frequency: isProcedure && fields?.frequency ? fields.frequency : undefined,
      numberOfRepeats:
        isProcedure && fields?.numberOfRepeats?.trim() ? Number(fields.numberOfRepeats) : undefined,
      __id: newId(),
      __grouping: grouping!,
      __restType: REST_TYPE_BY_KIND[kind!],
      __orderTypeUuid: preset!.orderTypeUuid,
      __careSetting: careSettingUuid!,
    }),
    [grouping, kind, preset, careSettingUuid, isImaging, isServiceOrder, isProcedure],
  );

  const canOrder = formReady && !!patientUuid && !!careSettingUuid && !!preset && !!kind && !!grouping;

  const addToBasket = useCallback(
    (concept: OrderableConcept, fields?: OrderFields) => {
      if (!canOrder) return;
      addBasketItem(patientUuid!, grouping!, buildItem(concept, fields));
      showSnackbar({
        title: t('addedToBasket', 'Added to order basket'),
        subtitle: concept.display,
        kind: 'success',
        isLowContrast: true,
      });
      // Billing is not done here: orders are auto-billed at "Sign and close"
      // time (see postDataPrep in order-basket). Adding to the basket only shows
      // the "No price configured" hint in the form.
    },
    [canOrder, patientUuid, grouping, buildItem, t],
  );

  const basketItemFor = useCallback(
    (conceptUuid: string) => basketItems.find((i) => i.concept.uuid === conceptUuid),
    [basketItems],
  );

  const titleByKind: Record<NonNullable<AddOrderWorkspaceProps['kind']>, [string, string]> = {
    imaging: ['addImagingOrder', 'Add imaging order'],
    procedure: ['addProcedureOrder', 'Add procedure order'],
    medicalSupply: ['addMedicalSupplyOrder', 'Add medical supply order'],
  };
  const searchPlaceholderByKind: Record<NonNullable<AddOrderWorkspaceProps['kind']>, [string, string]> = {
    imaging: ['searchImagingTest', 'Search for an imaging test'],
    procedure: ['searchProcedure', 'Search for a procedure'],
    medicalSupply: ['searchMedicalSupply', 'Search for a medical supply'],
  };
  const [titleKey, titleDefault] = titleByKind[kind ?? 'imaging'];
  const [searchKey, searchDefault] = searchPlaceholderByKind[kind ?? 'imaging'];

  const scheduledDateMissing = urgency === 'ON_SCHEDULED_DATE' && !scheduledDate;
  const canSaveForm = canOrder && !scheduledDateMissing;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formConcept || !canSaveForm) return;
    setSubmitting(true);
    addToBasket(formConcept, {
      urgency,
      scheduledDate,
      laterality,
      orderReason,
      instructions,
      accessionNumber,
      procedureType,
      bodySite,
      frequency,
      numberOfRepeats,
      commentToFulfiller,
    });
    setSubmitting(false);
    closeWorkspace?.({ closeWindow: false, discardUnsavedChanges: true });
  }

  // --- Order form view (instructions for a single concept) --------------------
  if (formConcept) {
    return (
      <Workspace2 title={t(titleKey, titleDefault)}>
        <Form
          onSubmit={handleSubmit}
          style={{ padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack gap={5} style={{ flex: 1 }}>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={(props: React.ComponentProps<typeof ArrowLeft>) => <ArrowLeft size={16} {...props} />}
              onClick={closeForm}>
              {t('backToSearch', 'Back to search')}
            </Button>

            {noPriceConfigured && (
              <InlineNotification
                kind="warning"
                lowContrast
                title={t('noPriceConfigured', 'No price configured for this service')}
                hideCloseButton
              />
            )}

            <div>
              <span style={{ fontSize: '0.75rem', color: '#6f6f6f' }}>{t('orderable', 'Orderable')}</span>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>{formConcept.display}</div>
            </div>

            {isProcedure && (
              <TextInput
                id="referenceNumber"
                labelText={t('referenceNumber', 'Reference number')}
                value={accessionNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccessionNumber(e.target.value)}
                disabled={submitting}
              />
            )}

            {isProcedure && (
              <Select
                id="operationCategory"
                labelText={t('operationCategory', 'Operation category')}
                value={procedureType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProcedureType(e.target.value)}
                disabled={submitting}>
                <SelectItem value="" text={t('chooseAnOption', 'Choose an option')} />
                {procedureTypeOptions.map((c: OrderableConcept) => (
                  <SelectItem key={c.uuid} value={c.uuid} text={c.display} />
                ))}
              </Select>
            )}

            {isProcedure && (
              // "Elective" vs "Emergency" maps onto the order's urgency so no
              // extra backend field is needed.
              <Select
                id="procedurePriority"
                labelText={t('priority', 'Priority')}
                value={urgency}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setUrgency(e.target.value as OrderFields['urgency'])
                }
                disabled={submitting}>
                <SelectItem value="STAT" text={t('emergency', 'Emergency')} />
                <SelectItem value="ROUTINE" text={t('elective', 'Elective')} />
              </Select>
            )}

            {!isProcedure && (
              <Select
                id="priority"
                labelText={t('priority', 'Priority')}
                value={urgency}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const value = e.target.value as OrderFields['urgency'];
                  setUrgency(value);
                  if (value !== 'ON_SCHEDULED_DATE') setScheduledDate(null);
                }}
                disabled={submitting}>
                <SelectItem value="ROUTINE" text={t('routine', 'Routine')} />
                <SelectItem value="STAT" text={t('stat', 'Stat')} />
                <SelectItem value="ON_SCHEDULED_DATE" text={t('scheduled', 'Scheduled')} />
              </Select>
            )}

            {!isProcedure && urgency === 'ON_SCHEDULED_DATE' && (
              <OpenmrsDatePicker
                id="scheduledDate"
                labelText={t('scheduledDate', 'Scheduled date')}
                value={scheduledDate}
                minDate={new Date()}
                invalid={scheduledDateMissing}
                invalidText={t('scheduledDateRequired', 'Scheduled date is required')}
                onChange={(date?: Date | null) => setScheduledDate(date ?? null)}
              />
            )}

            {isImaging && (
              <Select
                id="laterality"
                labelText={t('laterality', 'Laterality')}
                value={laterality}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setLaterality(e.target.value as typeof laterality)
                }
                disabled={submitting}>
                <SelectItem value="" text={t('none', 'None')} />
                <SelectItem value="LEFT" text={t('left', 'Left')} />
                <SelectItem value="RIGHT" text={t('right', 'Right')} />
                <SelectItem value="BILATERAL" text={t('bilateral', 'Bilateral')} />
              </Select>
            )}

            {isProcedure && (
              <Select
                id="bodySite"
                labelText={t('bodySite', 'Body site')}
                value={bodySite}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBodySite(e.target.value)}
                disabled={submitting}>
                <SelectItem value="" text={t('chooseAnOption', 'Choose an option')} />
                {bodySiteOptions.map((c: OrderableConcept) => (
                  <SelectItem key={c.uuid} value={c.uuid} text={c.display} />
                ))}
              </Select>
            )}

            {isProcedure && (
              <NumberInput
                id="numberOfRepeats"
                label={t('numberOfRepeats', 'Number of repeats')}
                min={0}
                value={numberOfRepeats === '' ? '' : Number(numberOfRepeats)}
                onChange={(_e: unknown, { value }: { value: number | string }) =>
                  setNumberOfRepeats(value === '' || value == null ? '' : String(value))
                }
                disabled={submitting}
                hideSteppers={false}
                allowEmpty
              />
            )}

            {isProcedure && (
              <Select
                id="frequency"
                labelText={t('frequency', 'Frequency')}
                value={frequency}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFrequency(e.target.value)}
                disabled={submitting}>
                <SelectItem value="" text={t('chooseAnOption', 'Choose an option')} />
                {frequencies.map((f) => (
                  <SelectItem key={f.uuid} value={f.uuid} text={f.display} />
                ))}
              </Select>
            )}

            {isServiceOrder && !isProcedure && (
              <TextArea
                id="orderReason"
                labelText={t('orderReason', 'Order reason')}
                placeholder={t('optionalOrderReason', 'Optional reason for the order')}
                value={orderReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setOrderReason(e.target.value)}
                enableCounter
                maxCount={500}
                disabled={submitting}
                rows={3}
              />
            )}

            <TextArea
              id="instructions"
              labelText={t('additionalInstructions', 'Additional instructions')}
              placeholder={t('optionalInstructions', 'Optional instructions for the order')}
              value={instructions}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInstructions(e.target.value)}
              enableCounter
              maxCount={500}
              disabled={submitting}
              rows={3}
            />

            {isProcedure && (
              <TextArea
                id="commentToFulfiller"
                labelText={t('commentsToFulfiller', 'Comments to fulfiller')}
                placeholder={t('optionalCommentsToFulfiller', 'Optional comments for the person performing the procedure')}
                value={commentToFulfiller}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCommentToFulfiller(e.target.value)}
                enableCounter
                maxCount={500}
                disabled={submitting}
                rows={3}
              />
            )}

            <p style={{ fontSize: '0.875rem', color: '#525252' }}>
              {t('addToBasketHelp', 'This order is added to the order basket. Click "Sign and close" to submit all orders.')}
            </p>
          </Stack>

          <ButtonSet style={{ marginTop: '1rem' }}>
            <Button kind="secondary" onClick={closeForm} disabled={submitting} size={isTablet ? 'lg' : 'md'}>
              {t('cancel', 'Cancel')}
            </Button>
            <Button kind="primary" type="submit" disabled={!canSaveForm || submitting} size={isTablet ? 'lg' : 'md'}>
              {t('saveOrder', 'Save order')}
            </Button>
          </ButtonSet>
        </Form>
      </Workspace2>
    );
  }

  // --- Search + results list view ---------------------------------------------
  return (
    <Workspace2 title={t(titleKey, titleDefault)}>
      <div style={{ padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={(props: React.ComponentProps<typeof ArrowLeft>) => <ArrowLeft size={16} {...props} />}
          onClick={() => closeWorkspace?.({ closeWindow: false, discardUnsavedChanges: true })}>
          {t('backToOrderBasket', 'Back to order basket')}
        </Button>

        {missingContext && (
          <InlineNotification
            kind="warning"
            title={t('cannotOrder', 'Cannot add order')}
            subtitle={missingContext}
            hideCloseButton
          />
        )}

        <Search
          size="lg"
          labelText={t(searchKey, searchDefault)}
          placeholder={t(searchKey, searchDefault)}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value ?? '')}
          disabled={!!missingContext}
        />

        {conceptsLoading ? (
          <InlineLoading description={t('loading', 'Loading…')} />
        ) : results.length === 0 ? (
          <Tile style={{ textAlign: 'center', padding: '1.5rem' }}>
            <p style={{ fontWeight: 600 }}>
              {t('noResultsFor', 'No results to display for "{{query}}"', { query: debouncedQuery })}
            </p>
          </Tile>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {results.map((concept) => {
              const existing = basketItemFor(concept.uuid);
              return (
                <Tile key={concept.uuid} style={{ padding: 0 }}>
                  <div style={{ padding: '0.75rem', fontWeight: 600 }}>{concept.display}</div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#f4f4f4',
                    }}>
                    {existing ? (
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        renderIcon={(props: React.ComponentProps<typeof ShoppingCartArrowUp>) => (
                          <ShoppingCartArrowUp size={16} {...props} />
                        )}
                        onClick={() => patientUuid && grouping && removeBasketItem(patientUuid, grouping, existing.__id)}>
                        {t('removeFromBasket', 'Remove from basket')}
                      </Button>
                    ) : (
                      <Button
                        kind="ghost"
                        size="sm"
                        disabled={!canOrder}
                        renderIcon={(props: React.ComponentProps<typeof ShoppingCartArrowDown>) => (
                          <ShoppingCartArrowDown size={16} {...props} />
                        )}
                        onClick={() => addToBasket(concept)}>
                        {t('addToBasket', 'Add to basket')}
                      </Button>
                    )}
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={(props: React.ComponentProps<typeof ArrowRight>) => <ArrowRight size={16} {...props} />}
                      onClick={() => {
                        setUrgency(existing?.urgency ?? 'ROUTINE');
                        setScheduledDate(existing?.scheduledDate ? new Date(existing.scheduledDate) : null);
                        setLaterality(existing?.laterality ?? '');
                        setOrderReason(existing?.orderReasonNonCoded ?? '');
                        setInstructions(existing?.instructions ?? '');
                        setAccessionNumber(existing?.accessionNumber ?? '');
                        setProcedureType(existing?.orderReason ?? '');
                        setBodySite(existing?.specimenSource ?? '');
                        setCommentToFulfiller(existing?.commentToFulfiller ?? '');
                        setFrequency(existing?.frequency ?? '');
                        setNumberOfRepeats(existing?.numberOfRepeats != null ? String(existing.numberOfRepeats) : '');
                        setFormConcept(concept);
                      }}>
                      {t('orderForm', 'Order form')}
                    </Button>
                  </div>
                </Tile>
              );
            })}
          </div>
        )}
      </div>
    </Workspace2>
  );
};

export default AddOrderWorkspace;
