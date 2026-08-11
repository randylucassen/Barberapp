// Vertaalt de meest voorkomende Supabase Auth-foutmeldingen naar Nederlandse
// copy. Onbekende fouten krijgen een generieke, veilige melding.
export function authErrorMessage(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Onjuist e-mailadres of wachtwoord.";
  }
  if (message.includes("Email not confirmed")) {
    return "Bevestig eerst je e-mailadres via de link die we je gestuurd hebben.";
  }
  if (message.includes("User already registered")) {
    return "Er bestaat al een account met dit e-mailadres.";
  }
  if (message.includes("Password should be at least")) {
    return "Wachtwoord moet minimaal 8 tekens zijn.";
  }
  if (message.includes("rate limit")) {
    return "Te veel pogingen. Probeer het over een paar minuten opnieuw.";
  }
  return "Er ging iets mis. Probeer het opnieuw.";
}
