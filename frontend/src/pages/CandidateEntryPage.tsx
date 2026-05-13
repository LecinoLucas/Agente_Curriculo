import { ArrowRight, FileText, LogIn } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export function CandidateEntryPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="border-none bg-gradient-to-br from-primary to-sky-700 text-primary-foreground shadow-sm">
          <CardHeader>
            <CardTitle className="text-3xl font-semibold tracking-tight">Portal do candidato</CardTitle>
            <CardDescription className="text-primary-foreground/80">
              Faça seu cadastro para se candidatar a vagas ou entre para acompanhar o status da sua candidatura.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/10 p-4 text-sm text-primary-foreground/90">
              O fluxo oficial do candidato fica concentrado aqui: cadastro, login e acompanhamento.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escolha como continuar</CardTitle>
            <CardDescription>
              Use cadastro para enviar candidatura e login para consultar seu portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-between">
              <Link to="/candidato/cadastro">
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Quero me candidatar
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/candidato/login">
                <span className="inline-flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Já tenho cadastro
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
