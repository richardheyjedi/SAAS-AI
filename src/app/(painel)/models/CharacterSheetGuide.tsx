// Guia canônico de character sheet (spec 2026-07-31-refs-proprias §5).
// Sem hooks: usável tanto no formulário (client) quanto no empty state (server).
export function CharacterSheetGuide({ startOpen = false }: { startOpen?: boolean }) {
  return (
    <details className="guide" open={startOpen}>
      <summary>📸 Como montar um character sheet consistente</summary>
      <ul>
        <li>Use <b>3 a 5 fotos da MESMA pessoa</b> — misturar pessoas quebra a consistência.</li>
        <li>Inclua: <b>rosto de frente bem nítido</b>, <b>perfil ou 3/4</b> e <b>corpo inteiro</b>.</li>
        <li><b>Mesma aparência em todas</b>: cabelo, maquiagem e roupa iguais entre as fotos.</li>
        <li><b>Fundo neutro e luz uniforme</b> — evite sombras duras e contraluz.</li>
        <li><b>Sem filtros, óculos escuros ou chapéu</b> — nada que esconda traços do rosto.</li>
        <li>Resolução mínima ~720p; rosto ocupando boa parte do quadro na foto principal.</li>
        <li><b>A 1ª foto é a base da composição dos vídeos</b> — deixe a melhor em primeiro.</li>
        <li>Para referências geradas por IA: fixe os traços no prompt personalizado (cor e corte de cabelo, cor dos olhos, tom de pele, marcas) — quanto mais específico, mais consistente.</li>
      </ul>
    </details>
  );
}
