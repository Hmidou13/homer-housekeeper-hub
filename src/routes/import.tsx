import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { parseMenagesCsv, parseReservationsCsv, type ParsedCleaning } from "@/lib/csv-parsers";
import {
  importCleanings,
  importCleaningsForProperty,
  type ImportResult,
  type UnmatchedRow,
  detectCancellations,
  applyCancellations,
  type CancellationInfo,
} from "@/lib/import-service";
import { useQueryClient } from "@tanstack/react-query";
import { CreatePropertyModal } from "@/components/CreatePropertyModal";
import { guessPropertyType } from "@/lib/utils";
import { formatFrDate } from "@/lib/time-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/import")({ component: () => <RequireAuth><ImportPage /></RequireAuth> });

type Preview = {
  rows: ParsedCleaning[];
  ignored?: number;
  excluded?: number;
  result?: ImportResult;
};

function ImportPage() {
  const [m, setM] = useState<Preview | null>(null);
  const [r, setR] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [createPropertyData, setCreatePropertyData] = useState<any | null>(null);
  const [cancellations, setCancellations] = useState<CancellationInfo[]>([]);

  const onCreate = (u: UnmatchedRow) => setCreatePropertyData({
    nom: u.property_name,
    avantio_code: u.property_avantio_code ?? "",
    type: guessPropertyType(u.property_name),
  });


  return (
    <div className="space-y-6 max-w-5xl">
      <p className="text-sm text-muted-foreground">
        Importez les deux rapports CSV exportés depuis Avantio. Les ménages déjà saisis par Homer (heures, statuts) ne sont jamais écrasés.
      </p>

      <Zone
        emoji="🛏️"
        title='Rapport "Nettoyage et services par jours"'
        description="Génère les ménages voyageurs (et signale les cas à vérifier)."
        accept=".csv"
        onParsed={(text) => {
          const { rows, excluded } = parseMenagesCsv(text);
          setM({ rows, excluded });
        }}
        preview={m}
        confirmLabel={`Importer ${m?.rows.length ?? 0} ménage${(m?.rows.length ?? 0) > 1 ? "s" : ""} voyageur(s)`}
        onConfirm={async () => {
          if (!m) return;
          setBusy(true);
          const res = await importCleanings(m.rows);
          setM({ ...m, result: res });
          setBusy(false);
          toast.success(`${res.created} créés · ${res.updated} mis à jour · ${res.skipped} protégés`);
        }}
        busy={busy}
        onCreateProperty={onCreate}
      />

      <Zone
        emoji="🏠🔒"
        title='Rapport "Liste réservation"'
        description="Génère les séjours propriétaire et les blocages à arbitrer."
        accept=".csv"
        onParsed={async (text) => {
          const { rows, ignored, excluded, cancelled } = parseReservationsCsv(text);
          setR({ rows, ignored, excluded });
          const detected = await detectCancellations(cancelled);
          setCancellations(detected);
        }}
        preview={r}
        confirmLabel={`Importer ${r?.rows.length ?? 0} ligne(s) (${r?.ignored ?? 0} ignorée(s))`}
        onConfirm={async () => {
          if (!r) return;
          setBusy(true);
          const res = await importCleanings(r.rows);
          setR({ ...r, result: res });
          setBusy(false);
          toast.success(`${res.created} créés · ${res.updated} mis à jour · ${res.skipped} protégés`);
        }}
        busy={busy}
        onCreateProperty={onCreate}
      />

      {cancellations.length > 0 && (
        <div className="border border-destructive/40 rounded-lg p-4 bg-destructive/5 space-y-3">
          <div className="font-semibold text-destructive">
            ⚠️ {cancellations.length} réservation(s) annulée(s) détectée(s)
          </div>
          <p className="text-xs text-muted-foreground">
            Ces ménages existent dans Homer et sont annulés côté Avantio. Confirmez pour les passer en statut "Annulé".
          </p>
          <ul className="space-y-2 text-sm">
            {cancellations.map((c) => (
              <li key={c.cleaning_id} className="flex flex-col gap-0.5 border-b border-destructive/20 pb-2 last:border-0">
                <div className="flex gap-2">
                  <span className="text-muted-foreground tabular-nums">{formatFrDate(c.date_menage)}</span>
                  <span className="font-medium">{c.property_name}</span>
                </div>
                {c.has_equipe && (
                  <span className="text-xs text-destructive">
                    ⚠️ Équipe affectée : {c.equipe_noms.join(", ")} — pense à prévenir
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              try {
                const n = await applyCancellations(cancellations.map((c) => c.cleaning_id));
                toast.success(`${n} ménage(s) annulé(s)`);
                setCancellations([]);
              } catch (e: any) {
                toast.error(e?.message ?? "Erreur lors de l'annulation");
              }
            }}
          >
            Confirmer les annulations
          </Button>
        </div>
      )}

      {createPropertyData && (
        <CreatePropertyModal
          initialData={createPropertyData}
          onClose={(created) => {
            setCreatePropertyData(null);
            if (created) toast.success("Maison créée. Relancez l'import pour intégrer le(s) ménage(s) concerné(s).");
          }}
        />
      )}
    </div>
  );
}

function Zone(props: {
  emoji: string;
  title: string;
  description: string;
  accept: string;
  onParsed: (text: string) => void;
  preview: Preview | null;
  confirmLabel: string;
  onConfirm: () => void;
  busy: boolean;
  onCreateProperty: (u: UnmatchedRow) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  async function handle(file: File) {
    const text = await file.text();
    props.onParsed(text);
  }
  return (
    <section className="bg-card rounded-lg border p-5">
      <div className="flex items-start gap-4">
        <div className="text-3xl">{props.emoji}</div>
        <div className="flex-1">
          <h2 className="font-semibold text-primary">{props.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{props.description}</p>
        </div>
      </div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handle(f); }}
        onClick={() => inputRef.current?.click()}
        className="mt-4 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40 transition"
      >
        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
        <p className="text-sm mt-2">Glissez votre CSV ici ou cliquez pour parcourir</p>
        <input
          ref={inputRef}
          type="file"
          accept={props.accept}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
        />
      </div>

      {props.preview && (
        <div className="mt-4 space-y-3">
          <div className="text-sm bg-secondary rounded p-3">
            <strong>{props.preview.rows.length}</strong> ligne(s) détectée(s).
            {props.preview.ignored !== undefined && <> {props.preview.ignored} ignorée(s) (déjà importées via le rapport ménages).</>}
            {props.preview.excluded !== undefined && props.preview.excluded > 0 && (
              <span className="text-muted-foreground"> · {props.preview.excluded} exclu(s) hors périmètre Homer</span>
            )}
          </div>
          {!props.preview.result && (
            <Button onClick={props.onConfirm} disabled={props.busy || props.preview.rows.length === 0}>
              {props.busy ? "Import en cours…" : props.confirmLabel}
            </Button>
          )}
          {props.preview.result && (
            <div className="text-sm bg-success/10 border border-success/30 rounded p-3 space-y-1">
              <div>✅ <strong>{props.preview.result.created}</strong> créés</div>
              <div>🔁 <strong>{props.preview.result.updated}</strong> mis à jour</div>
              <div>🛡️ <strong>{props.preview.result.skipped}</strong> protégés (saisies Homer présentes)</div>
              {props.preview.result.unmatched.length > 0 && (
                <details className="text-warning">
                  <summary className="cursor-pointer">
                    ⚠️ {props.preview.result.unmatched.length} ménage(s) non-importés (maison absente du référentiel)
                  </summary>
                  <ul className="mt-2 ml-4 space-y-1.5 text-xs">
                    {props.preview.result.unmatched.map((u, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 bg-warning/10 rounded px-2 py-1">
                        <span>
                          {u.property_name}
                          {u.property_avantio_code ? <span className="text-muted-foreground"> (code: {u.property_avantio_code})</span> : null}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => props.onCreateProperty(u)}>
                          🆕 Créer cette maison
                        </Button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
