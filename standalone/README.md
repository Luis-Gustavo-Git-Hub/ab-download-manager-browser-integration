# Downloads Independentes — prévia funcional

Carregue **esta pasta** em chrome://extensions → Modo do desenvolvedor → Carregar sem compactação. Não é necessário npm ou aplicativo auxiliar. Não instale simultaneamente com a integração original para evitar interferências de captura.

A ação do ícone abre diretamente o gerenciador paralelo em uma aba completa. O modo alternativo do navegador está no link abaixo do campo. Há dois downloads nativos ativos; pausar libera uma vaga.

Esta prévia implementa o modo nativo da etapa 1 do PRD. Inclui motor paralelo experimental com quatro conexões, partes em OPFS e montagem por streaming. Não implementa hash de referência nem toda a homologação de recuperação. Não é uma versão final do PRD. O código upstream em src/ continua disponível como referência; este manifesto não carrega aquele código nem se conecta ao aplicativo.

Permissões: downloads (transferências), storage (fila local), contextMenus (ação em links), alarms (reconciliação). Não há extração de cookies, nativeMessaging, analytics ou servidor próprio. O modo paralelo solicita acesso opcional apenas ao site escolhido; o usuário pode revogar esse acesso nas configurações da extensão. Links ativos podem conter tokens e são armazenados apenas localmente; apagar o item remove esses metadados. Dados da extensão são removidos ao desinstalar, conforme o navegador.

Verificações executadas: sintaxe dos dois scripts; simulação das APIs para concorrência, fila, cancelamento, conclusão, remoção de URL concluída e rejeição de esquemas inválidos. Instalação real no Chrome, reinício do browser e download em rede ainda precisam ser homologados.

## Motor paralelo experimental

Abra o link do modo paralelo. Requer Chrome 120+, OPFS, Web Locks e seletor de arquivo. Verifique um link público, permita o acesso à origem e inicie. Mantém quatro conexões, partes de 8 MiB, até três tentativas para falhas transitórias de partes, timeout de inatividade de 30 segundos, tamanho e ETag forte verificados. Não segue redirecionamentos nem envia credenciais. O modo padrão atende destinos incompatíveis.

A aba do paralelo precisa ficar aberta. Fechá-la interrompe as conexões; ao reabrir, partes completas podem ser revalidadas e reutilizadas. Partes incompletas são baixadas novamente. O arquivo final só é confirmado após fechar o fluxo de gravação. Depois de salvar, use Descartar partes locais para liberar o espaço temporário. Existe apenas um trabalho paralelo local de cada vez, com bloqueio entre abas.

Verificado com respostas HTTP simuladas: montagem byte a byte, checkpoints, reaproveitamento de partes, rejeição de HTTP 200 em pedido parcial, ETag alterado, resposta truncada e compressão. A homologação real de OPFS, permissões, gravação e ciclo de vida ainda é necessária antes de lançar. Retry automático, benchmark, hash de referência e matriz completa permanecem pendentes do PRD.
