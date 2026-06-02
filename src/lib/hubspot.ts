// HubSpot deep-link helper.
// Example record URL provided by the team:
//   https://app-eu1.hubspot.com/contacts/4960096/record/0-2/39454984194
//   └ portal id 4960096 · EU region (app-eu1) · object type 0-2 (company) · record id
// We only have the company record id (hubspotId from the enrichment sync), so we
// rebuild the rest from these known constants.

const PORTAL_ID = "4960096";
const APP_HOST = "app-eu1.hubspot.com";
const COMPANY_OBJECT = "0-2";

export function hubspotCompanyUrl(hubspotId: string | null | undefined): string | null {
  if (!hubspotId) return null;
  return `https://${APP_HOST}/contacts/${PORTAL_ID}/record/${COMPANY_OBJECT}/${hubspotId}`;
}
