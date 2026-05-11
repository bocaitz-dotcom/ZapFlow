<?php


    header("Access-Control-Allow-Headers: Authorization, Content-Type");
    header("Access-Control-Allow-Origin: *");   
    header('Content-Type: application/json; charset=utf-8');

   date_default_timezone_set('America/Sao_Paulo');

    function FunctionCreate($body) {
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, 'https://http://localhost:8000/api/scheduler/create');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'accept: application/json, text/plain, */*',
            'accept-language: pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'cache-control: no-cache',
            'content-type: application/json',
            'origin: https://zapflow.cbase.store',
            'pragma: no-cache',
            'priority: u=1, i',
            'referer: https://zapflow.cbase.store/',
            'sec-ch-ua: "Microsoft Edge";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            'sec-ch-ua-mobile: ?0',
            'sec-ch-ua-platform: "Windows"',
            'sec-fetch-dest: empty',
            'sec-fetch-mode: cors',
            'sec-fetch-site: same-site',
            'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0',
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));

        return $response = curl_exec($ch);

        curl_close($ch);
    }
 
    function montarPayloadDinamico(string $instance_name, string $template_name, array $dados): array
    {
        $payload = [
            "instance_name" => $instance_name,
            "template_name" => $template_name,
        ];

        foreach ($dados as $chave => $valor) {
            if (!isset($valor) || $valor === '') continue;

            if ($chave === 'phone') {
                $valor = preg_replace('/\D/', '', $valor);
            }

            $payload[$chave] = trim((string)$valor);
        }

        return $payload;
    }

    $dados = file_get_contents("https://777.base-painel.online/api/dontus/donto.php");

    $dadosArray = json_decode($dados, true);

    $hoje = $dadosArray['hoje'];
    $proximas_24h = $dadosArray['proximas_24h'];
    $proximos_2_dias = $dadosArray['proximos_2_dias'];
    $aniversariantes = $dadosArray['aniversariantes'];

    $user_id = "e314b190-b5a9-4b2d-a194-7da04c3710f8";
    $schedule_at = "2026-05-01T19:13:00";
    $instance_name = "Odonto Leve";
    $template_name = "Aniversariantes";
  
    $body = [
        "user_id" => $user_id,
        "schedule_at" => $schedule_at,
        "payload" => [
            "instance_name" => $instance_name,
            "template_name" => $template_name,
        ]
    ];

   // processar agendamento de lembretes para consultas de hoje (2h antes)
    foreach ($dadosArray['hoje'] as $pessoa) {
        
        $tz = new DateTimeZone('America/Sao_Paulo');
        $agora = new DateTime('now', $tz);

        // Data real da consulta
        $consulta = DateTime::createFromFormat(
            'd/m/Y H:i',
            $pessoa['data'] . ' ' . $pessoa['horario'],
            $tz
        );

        if (!$consulta) {
            echo "Data inválida para {$pessoa['nome']}" . PHP_EOL;
            continue; // data inválida
        }

        // Horário para disparar (2h antes)
        $disparo = (clone $consulta)->modify('-2 hours');

        $schedule_at = $disparo->format('Y-m-d\TH:i:s');

        // REGRAS DE BLOQUEIO
        if ($consulta <= $agora) {
            echo "Consulta já passou para {$pessoa['nome']} {$schedule_at}" . PHP_EOL;
            continue; // consulta já passou
        }

        if ($disparo <= $agora) {
            echo "Lembrete já passou para {$pessoa['nome']} {$schedule_at}" . PHP_EOL;
            continue; // já passou o horário de enviar o lembrete
        }

        // $schedule_at = '2026-05-02T10:02:00';

        $payload = montarPayloadDinamico(
            $instance_name,
            "Lembrete Agendamento 2H", 
            $pessoa
        );

        $body = [
            "user_id" => $user_id,
            "schedule_at" => $schedule_at,
            "payload" => $payload
        ];

        echo FunctionCreate($body) . PHP_EOL;
    
        $contador++;
    }


    // processar aniversariantes para agendamento
    $base = new DateTime('today 10:00'); // começa 10:00 hoje

    $contador = 0;

    foreach ($dadosArray['aniversariantes'] as $pessoa) {

        // clona a base e soma X minutos
        $schedule = clone $base;
        $schedule->modify("+{$contador} minutes");

        $schedule_at = $schedule->format('Y-m-d\TH:i:s');

        // $schedule_at = '2026-05-02T10:02:00';

        $payload = montarPayloadDinamico(
            $instance_name,
            "Aniversariantes", 
            $pessoa
        );

        $body = [
            "user_id" => $user_id,
            "schedule_at" => $schedule_at,
            "payload" => $payload
        ];

        echo FunctionCreate($body) . PHP_EOL;
    
        $contador++;
    }

