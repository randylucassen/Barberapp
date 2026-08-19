// Eén bron van waarheid voor Barbershop Noviomagus' bedrijfsgegevens —
// stonden tot nu toe los gedupliceerd in privacybeleid/page.tsx en
// voorwaarden/page.tsx; met de factuur-PDF als derde plek de moeite waard
// om niet nogmaals te dupliceren.
export const COMPANY_INFO = {
  name: "Groomy",
  legalName: "Barbershop Noviomagus",
  legalForm: "eenmanszaak",
  kvkNumber: "83716580",
  address: "Plein 1944-17",
  postalCode: "6511 JC",
  city: "Nijmegen",
  email: "barbershopnoviomagus@gmail.com",
  // Nog niet aangevraagd/bekend — expliciete placeholder i.p.v. een
  // verzonnen nummer, zodat dit nooit per ongeluk als "ingevuld" oogt.
  btwNumber: "BTW-NUMMER NOG IN TE VULLEN",
} as const;
