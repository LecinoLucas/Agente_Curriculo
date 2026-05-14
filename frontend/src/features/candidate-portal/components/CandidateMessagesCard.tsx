import { AlertCircle, CheckCircle2, Inbox, Loader2, Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { communicationService } from "../../../services/communicationService";
import type { CandidateCommunication } from "../../../types/domain";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CandidateMessagesCard() {
  const [messages, setMessages] = useState<CandidateCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await communicationService.getCandidateCommunications();
      setMessages(payload.communications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar suas mensagens.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const handleMarkRead = async (messageId: string) => {
    setMarkingId(messageId);
    setError(null);
    try {
      await communicationService.markCommunicationRead(messageId);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, status: "read", read_at: new Date().toISOString() }
            : message,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível marcar a mensagem como lida.");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <Card className="overflow-hidden border-[hsl(var(--border)/0.5)] shadow-xl">
      <CardHeader className="border-b border-[hsl(var(--border)/0.3)] bg-[hsl(var(--surface-muted)/0.3)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold">Mensagens</CardTitle>
            <CardDescription>Atualizações enviadas pela equipe de recrutamento.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.4)] p-5 text-sm font-semibold text-[hsl(var(--text-muted))]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando mensagens...
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {!loading && !error && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[hsl(var(--border)/0.4)] py-10 text-center">
            <Inbox className="h-10 w-10 text-[hsl(var(--text-muted)/0.35)]" />
            <p className="text-sm font-semibold text-[hsl(var(--text-muted))]">
              Nenhuma mensagem no momento.
            </p>
          </div>
        ) : null}

        {!loading && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className="rounded-2xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface))] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-[hsl(var(--text))]">
                        {message.subject || "Mensagem"}
                      </p>
                      {message.status === "read" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Lida
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--text-muted))]">
                      {message.body}
                    </p>
                    <p className="mt-3 text-xs font-medium text-[hsl(var(--text-muted))]">
                      {formatDateTime(message.created_at)}
                    </p>
                  </div>

                  {message.status !== "read" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={markingId === message.id}
                      onClick={() => void handleMarkRead(message.id)}
                      className="font-bold"
                    >
                      {markingId === message.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Marcar como lida
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
