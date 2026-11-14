# PRD — Extensão independente de downloads

**Versão:** 1.0 | **Status:** proposta de implementação

> Nenhum software pode prometer zero falhas. O objetivo é evitar corrupção silenciosa, perda de progresso sem aviso e alegações de aceleração sem comprovação. Integridade tem prioridade sobre velocidade.

## Objetivo
Transformar a extensão atual em um gerenciador que baixa links diretamente pelo navegador, sem depender do AB Download Manager, de uma conta ou de servidores do projeto. Deve oferecer progresso, fila e recuperação quando segura, mantendo os dados localmente.

## Público e casos de uso
Usuário que quer baixar sem instalar outro aplicativo, acompanhar arquivos grandes, enfileirar links e recuperar transferências interrompidas. Fluxos: colar link; usar menu de contexto; enfileirar; pausar/cancelar; retomar; entender falhas.

## Escopo
**MVP:** URLs HTTP/HTTPS diretas; entrada manual e menu de contexto; modo padrão via navegador; modo paralelo próprio somente em cenários homologados; fila; progresso/velocidade; persistência e recuperação; histórico local; interface em português; independência do aplicativo original.

**Fora do MVP:** torrent/FTP, HLS/DASH, DRM, contorno de login/CAPTCHA, nuvem, serviço remoto, aceleração garantida, captura automática de todos os downloads. Firefox, autenticação ampliada e captura automática entram após validação separada.

Primeiro selecionar um navegador Chromium e versão mínima com uma prova técnica. Sem telemetria própria, conta, envio de links ao projeto ou código remoto. Aceleração só pode ser anunciada por cenário testado.

## Experiência e estados
Fluxo: informar link → validar → mostrar nome/destino → verificar capacidades → iniciar/enfileirar → acompanhar → validar → salvar → confirmar conclusão. Mostrar estado, bytes, tamanho se conhecido, velocidade, estimativa apenas se calculável e modo usado. Informação desconhecida deve ser explícita.

Estados: Na fila, Verificando, Baixando, Pausado, Aguardando conexão, Aguardando usuário, Interrompido, Validando, Salvando, Concluído, Falhou, Cancelado. Transições persistidas e centralizadas; eventos atrasados não concluem tarefa cancelada. Só marcar concluído após transferência, validações e confirmação de salvamento.

## Requisitos funcionais
1. Aceitar somente links HTTP/HTTPS válidos. Não executar conteúdo recebido nem registrar URL integral em logs. Query strings diferentes não podem ser presumidas equivalentes.
2. Inspecionar metadados quando possível; falha de HEAD não bloqueia download.
3. Accept-Ranges sozinho não habilita paralelismo. Confirmar resposta parcial, faixa, tamanho e validador.
4. Paralelismo requer tamanho conhecido e estável, faixas válidas, representação consistente, armazenamento e montagem homologados. Caso contrário, usar transferência única.
5. Verificar status, faixa, tamanho e validador de cada parte. Uma resposta integral ao pedir uma faixa nunca pode ser anexada como segmento.
6. Limitar conexões por arquivo e globalmente. Limites iniciais sugeridos: quatro conexões por arquivo, dois downloads ativos; confirmar na prova técnica. Reduzir em limitação.
7. Montar em ordem sem exigir que arquivo inteiro caiba na memória. Verificar tamanho; hash só prova correspondência se houver referência confiável.
8. Retomar somente após revalidar recurso e bytes. Reiniciar com aviso quando seguro não for possível. Não prometer execução após fechar o navegador sem comprovação.
9. Cancelar requisições, invalidar eventos pendentes e liberar temporários sem apagar arquivos finais.
10. Fila persistente; falha de um item não bloqueia os demais. Histórico local mínimo; limpar histórico não apaga arquivo.
11. Sanitizar nomes, impedir sobrescrita silenciosa e não abrir arquivo automaticamente.
12. Remover conexões e mensagens relativas ao aplicativo original.

## Arquitetura
UI; orquestrador de estados/concorrência; adaptador de download nativo; inspetor HTTP; motor segmentado; persistência/checkpoints; temporários; finalizador; recuperador. Fechar popup não cancela transferência. Persistir versão, tarefa, estado, modo, partes confirmadas e validadores. Registrar uma parte apenas depois de persistir os dados. Migração preserva dados ou informa erro, nunca apaga silenciosamente.

## Falhas e recuperação
- Faixas ignoradas/inválidas: abandonar modo paralelo e reiniciar seguro.
- Recurso ou ETag mudou: parar e não misturar versões.
- Link expirado/401/403: solicitar novo acesso sem repetir indefinidamente.
- 404/410: erro específico.
- 429: respeitar Retry-After válido e reduzir concorrência.
- 5xx/rede: até três tentativas com espera progressiva e variação aleatória.
- Sem progresso: timeout configurável.
- Disco cheio: suspender gravação, solicitar ação e preservar progresso confirmado.
- Falha ao salvar/montar: não marcar concluído; oferecer recuperação de temporários íntegros.
- Navegador encerrado: marcar interrompido, reconciliar e revalidar.
- Permissão revogada: suspender e explicar.
- Metadados corrompidos: isolar item.
- Cancelamento durante gravação: parcial nunca aparece como concluído.

## Segurança e privacidade
Menor conjunto de permissões, explicado no contexto; preferir acesso por origem. Links podem conter tokens: ocultar parâmetros sensíveis, não exportar credenciais, não persistir URLs além do necessário e não encaminhar autorização entre domínios. Validar mensagens entre componentes; tratar URL, nome, headers e arquivo como dados não confiáveis. Não ignorar erro de certificado, não expor API pública e não executar downloads automaticamente. Avisar sobre HTTP. Sem analytics, nuvem, servidor próprio ou histórico transmitido.

## Desempenho e acessibilidade
Memória não cresce conforme tamanho total; limites de buffers/conexões; agrupar atualizações de progresso; limpar temporários ao concluir/cancelar. Suporte a teclado, rótulos acessíveis e estado textual além de cor. Progresso indeterminado quando tamanho desconhecido.

## Critérios de aceite
- Suíte de integridade com 100% de bytes corretos e zero corrupção silenciosa.
- Detectar truncamento, lacunas, sobreposição, resposta inválida e mudança de representação.
- Cancelamento nunca resulta em conclusão tardia; fechar popup não interrompe.
- Interrupções geram estado coerente e recuperável.
- Testar servidor controlado com intervalos válidos/ignorados/inválidos, redirects, autenticação, tamanho desconhecido, compressão, ETag alterado, link expirado, 429, lentidão, truncamento e disco cheio.
- Documentar browser/versões, OS, limite de tamanho, salvamento e espaço temporário.
- Verificar zero tráfego para analytics/servidor do projeto, credenciais ausentes dos logs e limpeza funcional.
- Nenhuma dependência operacional do aplicativo.

## Etapas
**0. Prova técnica:** APIs, execução em background, armazenamento, permissões, retomada, salvamento, limites e browser suportado. Se arquivo grande exigir memória proporcional, bloquear motor paralelo.
**1. Independência:** modo padrão, UI, fila, histórico e remoção da dependência do app.
**2. Paralelismo:** inspeção, segmentação, validação e montagem para links públicos homologados.
**3. Recuperação:** checkpoints, retomada e migração.
**4. Candidata:** permissões, licença, acessibilidade, documentação e pacote.
**5. Expansão:** Firefox, captura automática e autenticação com aceite próprio.

## Bloqueios de lançamento
Não publicar com corrupção silenciosa, conclusão antes do salvamento, memória/retries/conexões sem limite, migração que perde dados, credenciais em logs, dependência residual ou promessa sem evidência.

**Definição de pronto:** usuário baixa um link compatível, acompanha a operação, recupera interrupções homologadas, recebe arquivo íntegro e entende limitações e ações diante de falhas.
