# AB Download Manager Browser Integration

O código original da integração com o AB Download Manager está em `src/`. A edição independente para Chrome está em [standalone/](standalone/).

## Instalação

Baixe ou clone este repositório, abra `chrome://extensions`, habilite o modo do desenvolvedor e escolha **Carregar sem compactação**, selecionando a pasta `standalone/`.

O popup oferece download padrão do Chrome e um modo paralelo experimental. Fechar o popup não cancela a transferência paralela: um worker da extensão mantém o trabalho e o progresso pode ser visto quando o popup for reaberto. Consulte [a documentação da edição independente](standalone/README.md) e [o PRD](PRD.md).

O modo paralelo precisa de suporte do servidor a intervalos de bytes, tamanho conhecido e ETag forte. Quando essas condições não são atendidas, a extensão inicia o download padrão. Não há aceleração garantida para todos os sites.