# Downloads Independentes — prévia funcional

Carregue **esta pasta** em chrome://extensions → Modo do desenvolvedor → Carregar sem compactação. Não é necessário npm ou aplicativo auxiliar. Não instale simultaneamente com a integração original para evitar interferências de captura.

O botão da extensão abre a lista; “Abrir em aba” mantém o gerenciador aberto. Cole links HTTP/HTTPS ou use o menu de contexto sobre um link. Os arquivos são gravados pelo navegador no destino configurado. Há dois downloads ativos; pausar libera uma vaga. Retomada depende de canResume do navegador. Reiniciar pode baixar novamente desde o início. Limpar histórico mantém os arquivos salvos.

Esta prévia implementa o modo nativo da etapa 1 do PRD. Não implementa aceleração paralela, hash de referência, configuração de destino por tarefa nem toda a homologação de recuperação. Não é uma versão final do PRD. O código upstream em src/ continua disponível como referência; este manifesto não carrega aquele código nem se conecta ao aplicativo.

Permissões: downloads (transferências), storage (fila local), contextMenus (ação em links), alarms (reconciliação). Não há acesso a cookies, páginas, nativeMessaging, host_permissions, analytics ou servidor próprio. Links ativos podem conter tokens e são armazenados apenas localmente; apagar o item remove esses metadados. Dados da extensão são removidos ao desinstalar, conforme o navegador.

Verificações executadas: sintaxe dos dois scripts; simulação das APIs para concorrência, fila, cancelamento, conclusão, remoção de URL concluída e rejeição de esquemas inválidos. Instalação real no Chrome, reinício do browser e download em rede ainda precisam ser homologados.
