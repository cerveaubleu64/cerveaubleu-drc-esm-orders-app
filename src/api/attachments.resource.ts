import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

/**
 * Uploads a single file as a patient attachment via the OpenMRS `attachment`
 * REST resource (provided by the `attachments` module).
 *
 * Browser-set Content-Type (with the multipart boundary) is preserved by
 * passing the FormData straight through — do NOT set Content-Type manually.
 */
export async function uploadPatientAttachment(file: File, patientUuid: string, caption?: string) {
  const formData = new FormData();
  formData.append('patient', patientUuid);
  if (caption) {
    formData.append('fileCaption', caption);
  }
  formData.append('file', file, file.name);

  return openmrsFetch(`${restBaseUrl}/attachment`, {
    method: 'POST',
    body: formData,
  });
}

export interface PatientAttachment {
  uuid: string;
  comment: string | null;
  dateTime: string;
  bytesContentFamily: string | null;
  bytesMimeType: string | null;
}

interface AttachmentsResponse {
  results: PatientAttachment[];
}

/** Lists the patient's attachments (images / PDFs uploaded against the patient). */
export function usePatientAttachments(patientUuid: string | undefined) {
  const url = patientUuid
    ? `${restBaseUrl}/attachment?patient=${patientUuid}&v=custom:(uuid,comment,dateTime,bytesContentFamily,bytesMimeType)`
    : null;
  const { data, error, isLoading, mutate } = useSWR<{ data: AttachmentsResponse }>(url, openmrsFetch);
  return {
    attachments: data?.data?.results ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * URL that streams the raw bytes of an attachment (served with the session
 * cookie). restBaseUrl is "/ws/rest/v1" with no OpenMRS base — openmrsFetch
 * prepends window.openmrsBase for us, but a raw <img src> / <a href> does not,
 * so we prepend it here to avoid a 404 on "/ws/rest/v1/...".
 */
export function attachmentBytesUrl(uuid: string): string {
  const base = (typeof window !== 'undefined' && (window as any).openmrsBase) || '/openmrs';
  return `${base}${restBaseUrl}/attachment/${uuid}/bytes`;
}

export function isImageAttachment(a: PatientAttachment): boolean {
  return (a.bytesContentFamily ?? '').toUpperCase() === 'IMAGE' || (a.bytesMimeType ?? '').startsWith('image/');
}

/** Permanently removes an attachment. */
export async function deletePatientAttachment(uuid: string) {
  return openmrsFetch(`${restBaseUrl}/attachment/${uuid}?purge=true`, { method: 'DELETE' });
}
