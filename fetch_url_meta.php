<?php
header('Content-Type: application/json');

// --- Configuration ---
define('REQUEST_TIMEOUT', 15); // seconds
define('USER_AGENT', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36');
// define('ALLOWED_ORIGIN', 'http://your-frontend-domain.com'); // TODO: Set this for production for security

// --- CORS Handling (Optional but recommended for production) ---
/*
if (isset($_SERVER['HTTP_ORIGIN'])) {
    // Check if the origin is allowed
    if (ALLOWED_ORIGIN === '*' || $_SERVER['HTTP_ORIGIN'] === ALLOWED_ORIGIN) {
        header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');    // cache for 1 day
    }
}

// Access-Control headers are received during OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    }
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    }
    exit(0);
}
*/

// --- Helper Function to Send JSON Response ---
function send_json_response($success, $data = null, $error = null, $httpStatusCode = null) {
    $response = ['success' => $success];
    if ($data !== null) {
        $response['data'] = $data;
    }
    if ($error !== null) {
        $response['error'] = $error;
    }
    if ($httpStatusCode !== null && isset($response['data'])) {
        $response['data']['httpStatusCode'] = $httpStatusCode;
    } elseif ($httpStatusCode !== null) {
        // If no data array, add it directly to response (mainly for error cases)
        $response['httpStatusCode'] = $httpStatusCode;
    }
    echo json_encode($response);
    exit;
}

// --- Main Logic ---
$request_method = $_SERVER['REQUEST_METHOD'];
$url_to_fetch = null;

if ($request_method === 'POST') {
    $url_to_fetch = isset($_POST['url']) ? trim($_POST['url']) : null;
} elseif ($request_method === 'GET') {
    $url_to_fetch = isset($_GET['url']) ? trim($_GET['url']) : null;
} else {
    send_json_response(false, null, 'Invalid request method. Only GET or POST are accepted.', 405);
}

if (empty($url_to_fetch)) {
    send_json_response(false, null, 'URL parameter is missing.', 400);
}

// Validate URL format (basic validation)
if (filter_var($url_to_fetch, FILTER_VALIDATE_URL) === false) {
    // Try to prepend http if scheme is missing and it looks like a domain
    if (!preg_match("~^(?:f|ht)tps?://~i", $url_to_fetch)) {
        $url_to_fetch = "http://" . $url_to_fetch;
    }
    // Re-validate
    if (filter_var($url_to_fetch, FILTER_VALIDATE_URL) === false) {
        send_json_response(false, null, 'Invalid URL format provided: ' . htmlspecialchars($url_to_fetch), 400);
    }
}


// Initialize cURL session
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url_to_fetch);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // Follow redirects
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);         // Limit redirects
curl_setopt($ch, CURLOPT_TIMEOUT, REQUEST_TIMEOUT);
curl_setopt($ch, CURLOPT_USERAGENT, USER_AGENT);
curl_setopt($ch, CURLOPT_FAILONERROR, false); // Do not fail on HTTP errors > 400, let us handle them
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true); // Verify SSL certificate
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);   // Check common name and verify peer

// To get header size and thus actual body
// curl_setopt($ch, CURLOPT_HEADER, true); // Include header in the output
// curl_setopt($ch, CURLINFO_HEADER_SIZE, true);


$html_content = curl_exec($ch);
$http_status_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error_no = curl_errno($ch);
$curl_error_msg = curl_error($ch);
curl_close($ch);

if ($curl_error_no) {
    send_json_response(false, null, "cURL Error ({$curl_error_no}): " . htmlspecialchars($curl_error_msg), $http_status_code ?: 500);
}

if ($http_status_code >= 400) {
    send_json_response(false, null, "Failed to fetch URL. HTTP Status Code: {$http_status_code}", $http_status_code);
}
if (empty($html_content)) {
     send_json_response(false, null, "Fetched content is empty. HTTP Status: {$http_status_code}", $http_status_code);
}


// --- Parse HTML Content ---
$doc = new DOMDocument();
@$doc->loadHTML('<?xml encoding="utf-8" ?>' . $html_content); // Suppress warnings from malformed HTML, ensure UTF-8
$xpath = new DOMXPath($doc);

$metaData = [
    'metaTitle' => '',
    'metaDescription' => '',
    'metaImage' => '',
    'wordCount' => 0,
    'httpStatusCode' => $http_status_code // Already have this
];

// Meta Title
$titleNode = $xpath->query('//title')->item(0);
if ($titleNode) {
    $metaData['metaTitle'] = trim($titleNode->textContent);
}
$ogTitleNode = $xpath->query('//meta[@property="og:title"]/@content')->item(0);
if ($ogTitleNode && empty($metaData['metaTitle'])) { // Prefer og:title if title was empty or not found
    $metaData['metaTitle'] = trim($ogTitleNode->nodeValue);
}
$twitterTitleNode = $xpath->query('//meta[@name="twitter:title"]/@content')->item(0);
if ($twitterTitleNode && empty($metaData['metaTitle'])) {
    $metaData['metaTitle'] = trim($twitterTitleNode->nodeValue);
}


// Meta Description
$descNode = $xpath->query('//meta[@name="description"]/@content')->item(0);
if ($descNode) {
    $metaData['metaDescription'] = trim($descNode->nodeValue);
}
$ogDescNode = $xpath->query('//meta[@property="og:description"]/@content')->item(0);
if ($ogDescNode && empty($metaData['metaDescription'])) {
    $metaData['metaDescription'] = trim($ogDescNode->nodeValue);
}
$twitterDescNode = $xpath->query('//meta[@name="twitter:description"]/@content')->item(0);
if ($twitterDescNode && empty($metaData['metaDescription'])) {
    $metaData['metaDescription'] = trim($twitterDescNode->nodeValue);
}

// Meta Image
$ogImageNode = $xpath->query('//meta[@property="og:image"]/@content')->item(0);
if ($ogImageNode) {
    $metaData['metaImage'] = trim($ogImageNode->nodeValue);
}
$twitterImageNode = $xpath->query('//meta[@name="twitter:image"]/@content')->item(0);
if ($twitterImageNode && empty($metaData['metaImage'])) {
    $metaData['metaImage'] = trim($twitterImageNode->nodeValue);
}
// Convert relative image URL to absolute if possible and necessary
if (!empty($metaData['metaImage']) && !preg_match("~^(?:f|ht)tps?://~i", $metaData['metaImage'])) {
    $url_parts = parse_url($url_to_fetch);
    if (isset($url_parts['scheme']) && isset($url_parts['host'])) {
        $base_url = $url_parts['scheme'] . '://' . $url_parts['host'];
        if ($metaData['metaImage'][0] === '/') { // Starts with /
            $metaData['metaImage'] = $base_url . $metaData['metaImage'];
        } else { // Relative path from current directory
            $path = isset($url_parts['path']) ? dirname($url_parts['path']) : '';
            $metaData['metaImage'] = $base_url . rtrim($path, '/') . '/' . $metaData['metaImage'];
        }
    }
}


// Word Count (simple estimation from body text)
$bodyNode = $xpath->query('//body')->item(0);
if ($bodyNode) {
    // Remove script and style tags before getting text content
    $scripts = $xpath->query('//script', $bodyNode);
    foreach ($scripts as $script) {
        $script->parentNode->removeChild($script);
    }
    $styles = $xpath->query('//style', $bodyNode);
    foreach ($styles as $style) {
        $style->parentNode->removeChild($style);
    }
    $bodyText = trim($bodyNode->textContent);
    if (!empty($bodyText)) {
        $words = preg_split('/\s+/', $bodyText, -1, PREG_SPLIT_NO_EMPTY);
        $metaData['wordCount'] = count($words);
    }
}

send_json_response(true, $metaData, null, $http_status_code);

?>
