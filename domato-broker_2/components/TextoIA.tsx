/** Muestra el texto del análisis (## títulos, - viñetas, **negritas**) sin inyectar HTML ajeno. */
export default function TextoIA({ texto, compacto = false }: { texto: string; compacto?: boolean }) {
  const lineas = texto.replace(/\r/g, "").split("\n");
  const bloques: JSX.Element[] = [];
  let lista: string[] = [];

  const negritas = (t: string, key: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
      parte.startsWith("**") && parte.endsWith("**") ? <strong key={`${key}-${i}`}>{parte.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{parte}</span>
    );
  const cerrarLista = () => {
    if (!lista.length) return;
    const k = `l${bloques.length}`;
    bloques.push(
      <ul key={k} className="ml-4 list-disc space-y-0.5">
        {lista.map((li, i) => <li key={i}>{negritas(li, `${k}-${i}`)}</li>)}
      </ul>
    );
    lista = [];
  };

  lineas.forEach((l, idx) => {
    const t = l.trim();
    if (!t) { cerrarLista(); return; }
    if (/^#{1,3}\s/.test(t)) {
      cerrarLista();
      bloques.push(<p key={`h${idx}`} className={compacto ? "mt-2 text-[11px] font-semibold uppercase tracking-[0.08em]" : "mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-paper"}>{t.replace(/^#{1,3}\s*/, "")}</p>);
      return;
    }
    if (/^[-•*]\s/.test(t)) { lista.push(t.replace(/^[-•*]\s*/, "")); return; }
    cerrarLista();
    bloques.push(<p key={`p${idx}`}>{negritas(t, `p${idx}`)}</p>);
  });
  cerrarLista();

  return <div className={compacto ? "text-[12px] leading-relaxed flex flex-col gap-1" : "text-sm leading-relaxed text-paper flex flex-col gap-1.5"}>{bloques}</div>;
}
