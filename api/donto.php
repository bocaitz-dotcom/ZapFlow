<?php

header("Access-Control-Allow-Headers: Authorization, Content-Type");
header("Access-Control-Allow-Origin: *");

header('Content-Type: application/json; charset=utf-8');

date_default_timezone_set('America/Sao_Paulo');

    function getRequestVerificationToken() {

        $url = "https://sistema.dontus.com.br/Login";

        $cookieFile = __DIR__ . "/cookies.txt";

        $ch = curl_init();

        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,

            CURLOPT_COOKIEJAR => $cookieFile,
            CURLOPT_COOKIEFILE => $cookieFile,

            CURLOPT_SSL_VERIFYPEER => false,

            CURLOPT_HTTPHEADER => [
                "user-agent: Mozilla/5.0"
            ],
        ]);

        $html = curl_exec($ch);

        if (curl_errno($ch)) {
            curl_close($ch);
            return [
                "success" => false,
                "error" => curl_error($ch)
            ];
        }

        curl_close($ch);

        // extrair token do HTML
        preg_match(
            '/name="__RequestVerificationToken"[^>]*value="([^"]+)"/',
            $html,
            $token
        );

        // extrair token do HTML
        preg_match(
            '/name="IDSistemaAmbiente"[^>]*value="([^"]+)"/',
            $html,
            $IDSistemaAmbiente
        );

        if (!isset($token[1])) {
            return [
                "success" => false,
                "error" => "Token não encontrado"
            ];
        }

        return [
            "success" => true,
            "token" => $token[1],
            "IDSistemaAmbiente" => $IDSistemaAmbiente[1]
        ];
    }

    $TokenDados = getRequestVerificationToken();

    $RequestVerificationToken = $TokenDados['token'] ?? null;
    $IDSistemaAmbiente = $TokenDados['IDSistemaAmbiente'] ?? null;

    if(!$RequestVerificationToken || !$IDSistemaAmbiente) {
        die(json_encode([
            "success" => false,
            "error" => "Não foi possível obter os tokens necessários"
        ]));
    }

    function extrairTokens($response) {

        $tokens = [];

        // pega todos Set-Cookie do retorno (302 + 200)
        preg_match_all('/Set-Cookie:\s*([^;=\s]+)=([^;]+)/i', $response, $matches, PREG_SET_ORDER);

        foreach ($matches as $m) {
            $nome  = trim($m[1]);
            $valor = trim($m[2]);

            // somente os tokens importantes do ASP.NET
            if (
                stripos($nome, 'ASP.NET_SessionId') !== false ||
                stripos($nome, '__RequestVerificationToken') !== false
            ) {
                $tokens[$nome] = $valor;
            }
        }

        return $tokens;
    }

     function R($url, $header, $data){
         $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "$url");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
        curl_setopt($ch, CURLOPT_HEADER, 1);
        if($header){ 
            curl_setopt($ch, CURLOPT_HTTPHEADER, $header);
        }
        curl_setopt($ch, CURLOPT_COOKIESESSION, true);
        curl_setopt($ch, CURLOPT_ENCODING, 'gzip');
        curl_setopt($ch, CURLOPT_COOKIEJAR, dirname(__FILE__) . "./cookie.txt");
        curl_setopt($ch, CURLOPT_COOKIEFILE, dirname(__FILE__) . "./cookie.txt");
        curl_setopt($ch, CURLOPT_COOKIE, dirname(__FILE__) . "./cookie.txt");
        curl_setopt($ch, CURLOPT_COOKIESESSION, dirname(__FILE__) . "./cookie.txt");
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
            if($data){ 
                curl_setopt($ch, CURLOPT_POST, 1);
                curl_setopt($ch, CURLOPT_POSTFIELDS, "$data");
            }else{
                curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'GET');
            }
        return curl_exec($ch);

    }

    $url = "https://sistema.dontus.com.br/Login";

      $postFields = http_build_query([
        "__RequestVerificationToken" => $RequestVerificationToken,
        "iddontus" => '240538',
        "UserName" => 'odontoleve',
        "emailConfirmar" => "",
        "password" => '@Willpl01',
        "IP" => "186.222.154.145",
        "IDSistemaAmbiente" => $IDSistemaAmbiente
    ]);

   $retorno =  R(
        $url,
        [
            "content-type: application/x-www-form-urlencoded",
            "user-agent: Mozilla/5.0",
            "accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        ],
        $postFields
    );

    $tokens = extrairTokens($retorno);

    if(!$tokens['ASP.NET_SessionId']) {
        die(json_encode([
            "success" => false,
            "error" => "Não foi possível extrair os NET_SessionId tokens necessários"
        ]));  
    }

    function convertDotNetDateWithAge($dateString) {
        if (!preg_match('/\/Date\((\-?\d+)\)\//', $dateString, $matches)) {
            return null;
        }

        $timestamp = $matches[1] / 1000;

        $dataNasc = new DateTime();
        $dataNasc->setTimestamp($timestamp);

        $hoje = new DateTime();

        return [
            'data' => $dataNasc->format('d/m/Y'),
            'idade' => $hoje->diff($dataNasc)->y
        ];
    }

    function primeiroNome(string $nome): string{
        $nome = trim($nome);

        // remove espaços duplicados no meio
        $nome = preg_replace('/\s+/', ' ', $nome);

        // pega tudo antes do primeiro espaço
        $partes = explode(' ', $nome);

        return $partes[0] ?? $nome;
    }

    function GetAniversariantes() {

    global $RequestVerificationToken, $tokens;  

        // formato americano
        $data = date('m/d/Y');

        // encode para URL
        $dataEncoded = urlencode($data);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, 'https://sistema.dontus.com.br/Home/GetAniversariantes?dataAtual=' . $dataEncoded);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'GET');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'accept: */*',
            'accept-language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'content-type: application/json; charset=utf-8',
            'priority: u=1, i',
            'referer: https://sistema.dontus.com.br/',
            'sec-ch-ua: "Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            'sec-ch-ua-mobile: ?0',
            'sec-ch-ua-platform: "Windows"',
            'sec-fetch-dest: empty',
            'sec-fetch-mode: cors',
            'sec-fetch-site: same-origin',
            'x-requested-with: XMLHttpRequest',
        ]);
        curl_setopt($ch, CURLOPT_COOKIE, '__RequestVerificationToken='.$RequestVerificationToken.'; ASP.NET_SessionId='.$tokens['ASP.NET_SessionId']);

        $response = curl_exec($ch);

        curl_close($ch);

        // converte JSON
        $data = json_decode($response, true);

        // define timezone SP
        $dataHoje = date('d/m/Y');

        $resultado = [];

        foreach ($data as $item) {
            $nome = $item['Nome'] ?? '';
            $cpf = $item['CPF'] ?? '';
            $telefone = $item['Cel'] ?? '';
    
            // limpa telefone (só números)
            $telefone = preg_replace('/\D/', '', $telefone);

            // ignora se não tiver telefone
            if (!$telefone) continue;

            // adiciona 55 se não tiver
            if (substr($telefone, 0, 2) !== "55") {
                $telefone = "55" . $telefone;
            }

            $conv = convertDotNetDateWithAge(
                $item['DataDeNascimento'] ?? $item['DataNascimento'] ?? ''
            );

            $resultado[] = [
                'nome' => primeiroNome($nome),
                'nome_completo' => $nome,
                'cpf' => $cpf,
                'phone' => $telefone,
                'data' => $conv['data'],
                'idade' => $conv['idade']
            ];
        }

        // exibe JSON limpo
        return json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }

    function GetAgendamentosCalendario(){

        global $RequestVerificationToken, $tokens;  

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, 'https://sistema.dontus.com.br/Agendamento/GetAgendamentosCalendario');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'accept: */*',
            'accept-language: pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'cache-control: no-cache',
            'content-type: application/x-www-form-urlencoded; charset=UTF-8',
            'origin: https://sistema.dontus.com.br',
            'pragma: no-cache',
            'priority: u=1, i',
            'referer: https://sistema.dontus.com.br/Agendamento',
            'sec-ch-ua: "Microsoft Edge";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            'sec-ch-ua-mobile: ?0',
            'sec-ch-ua-platform: "Windows"',
            'sec-fetch-dest: empty',
            'sec-fetch-mode: cors',
            'sec-fetch-site: same-origin',
            'x-requested-with: XMLHttpRequest',
        ]);
        curl_setopt($ch, CURLOPT_COOKIE, '__RequestVerificationToken=' . $RequestVerificationToken . '; ASP.NET_SessionId=' . $tokens['ASP.NET_SessionId']);

       function periodoSemana(){
                $inicio = new DateTime();
                $inicio->modify('last sunday');

                $fim = (clone $inicio)->modify('+7 days');

                return [
                    'inicio' => $inicio->format('Y-m-d'),
                    'fim' => $fim->format('Y-m-d')
                ];
        }

        $periodo = periodoSemana();

        $postFields = http_build_query([
            "DataAgendamento" => $periodo['inicio'],
            "DataAgendamentoFim" => $periodo['fim'],
            "IDClinica" => 1,
            "IsCompromisso" => "false",
            "TipoAgenda" => "agendaWeek"
        ]);

        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);

        $response = curl_exec($ch);

        curl_close($ch);

        return $response;
    }

    function formatarAgendamento($item){
        $inicio = new DateTime($item['start']);

        $phone = preg_replace('/\D/', '', $item["Contato"] ?? "");

        // adiciona 55 se não tiver
        if (substr($phone, 0, 2) !== "55") {
            $phone = "55" . $phone;
        }

        return [
            "data" => $inicio->format("d/m/Y"),
            "horario" => $inicio->format("H:i"),
            "nome" => primeiroNome($item["Paciente"] ?? ""),
            "nome_completo" => $item["Paciente"] ?? "",
            "phone" => $phone,
            "observacao" => $item["Observacao"] ?? ""
        ];
    }

    function separarAgendamentos($agendaJson){
        $agenda = json_decode($agendaJson, true);

        $agora = new DateTime();
        $em24h = (clone $agora)->modify('+24 hours');
        $em48h = (clone $agora)->modify('+48 hours');

        $resultado = [
            "hoje" => [],
            "proximas_24h" => [],
            "proximos_2_dias" => []
        ];

        foreach ($agenda as $item) {
            if (!isset($item['start'])) continue;

            $inicio = new DateTime($item['start']);
            $inicioData = $inicio->format('Y-m-d');
            $hojeData = $agora->format('Y-m-d');

            $formatado = formatarAgendamento($item);

            // HOJE
            if ($inicioData === $hojeData) {
                $resultado["hoje"][] = $formatado;
                continue;
            }

            // PRÓXIMAS 24H
            if ($inicio > $agora && $inicio <= $em24h) {
                $resultado["proximas_24h"][] = $formatado;
                continue;
            }

            // PRÓXIMOS 2 DIAS
            if ($inicio > $em24h && $inicio <= $em48h) {
                $resultado["proximos_2_dias"][] = $formatado;
                continue;
            }
        }

        return $resultado;
    }

    $agenda = GetAgendamentosCalendario();

    $aniversarios = GetAniversariantes();

    $resultado = separarAgendamentos($agenda);

    echo json_encode([
        "hoje" => $resultado["hoje"],
        "proximas_24h" => $resultado["proximas_24h"],
        "proximos_2_dias" => $resultado["proximos_2_dias"],
        "aniversariantes" => json_decode($aniversarios, true)
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
