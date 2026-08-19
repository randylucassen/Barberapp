// Eigen, lichte filter-/invoervakken i.p.v. de gedeelde <Input> uit
// components/ui — die is ontworpen voor phone-shell-formulieren
// (bg-surface-vulling, vaste 48px-hoogte, geen zichtbare rand) en valt op
// AdminShell's eigen bg-surface-paginaondergrond helemaal weg. Hier
// bewust een zichtbare rand + witte vulling, zelfde look als de rest van
// het adminpanel (bg-white border border-border, bv. de kaarten
// elders). Gedeeld tussen InvoicesTable en de Administratief-periodekiezer.
export function FilterField({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-text-secondary">{label}</span>
      <input
        {...rest}
        className="h-9 px-3 rounded-md bg-white border border-border text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:shadow-focus-ring transition-shadow duration-fast ease-groomy"
      />
    </label>
  );
}
