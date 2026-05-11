<?php

class DontusClient
{
    private string $baseUrl = "https://sistema.dontus.com.br";
    private string $cookieFile;
    private string $token;
    private string $ambiente;

    public function __construct()
    {
        $this->cookieFile = __DIR__ . "/cookie.txt";

        if (!file_exists($this->cookieFile)) {
            file_put_contents($this->cookieFile, '');
        }

        $this->initTokens();
    }

    /* ================= CORE REQUEST ================= */

    private function request(string $url, array $headers = [], $data = null): string
    {
        $ch = curl_init($url);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_ENCODING => 'gzip',

            CURLOPT_COOKIEJAR  => $this->cookieFile,
            CURLOPT_COOKIEFILE => $this->cookieFile,

            CURLOPT_HTTPHEADER => $headers,
        ]);

        if ($data) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        }

        $response = curl_exec($ch);
        curl_close($ch);

        return $response;
    }

    /* ================= TOKEN INIT ================= */

    private function initTokens(): void
    {
        $html = $this->request($this->baseUrl . "/Login", [
            "user-agent: Mozilla/5.0"
        ]);

        preg_match('/name="__RequestVerificationToken".*?value="([^"]+)"/', $html, $t);
        preg_match('/name="IDSistemaAmbiente".*?value="([^"]+)"/', $html, $a);

        $this->token = $t[1] ?? '';
        $this->ambiente = $a[1] ?? '';
    }

    /* ================= LOGIN ================= */

    public function login($iddontus, $user, $pass): void
    {
        $post = http_build_query([
            "__RequestVerificationToken" => $this->token,
            "iddontus" => $iddontus,
            "UserName" => $user,
            "emailConfirmar" => "",
            "password" => $pass,
            "IP" => "186.222.154.145",
            "IDSistemaAmbiente" => $this->ambiente
        ]);

        $this->request($this->baseUrl . "/Login", [
            "content-type: application/x-www-form-urlencoded",
            "user-agent: Mozilla/5.0"
        ], $post);
    }

    /* ================= GET AUTENTICADO ================= */

    public function get(string $endpoint, array $headers = []): string
    {
        $default = [
            'accept: */*',
            'x-requested-with: XMLHttpRequest'
        ];

        return $this->request(
            $this->baseUrl . $endpoint,
            array_merge($default, $headers)
        );
    }
}