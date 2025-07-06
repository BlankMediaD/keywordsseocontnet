<?php
header('Content-Type: application/json');

// --- Configuration ---
define('DATA_DIRECTORY', __DIR__ . '/reports/'); // Assumes 'reports' folder is in the same directory as this script
// define('ALLOWED_ORIGIN', 'http://your-frontend-domain.com'); // TODO: Set this for production

// --- CORS Handling (Optional but recommended for production) ---
/*
if (isset($_SERVER['HTTP_ORIGIN'])) {
    if (ALLOWED_ORIGIN === '*' || $_SERVER['HTTP_ORIGIN'] === ALLOWED_ORIGIN) {
        header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');    // cache for 1 day
    }
}

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    }
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header("Access-Control-Allow-Headers: Content-Type, X-Requested-With"); // Add Content-Type if receiving JSON POST
    }
    exit(0);
}
*/

// --- Helper Function to Send JSON Response ---
function send_json_response($success, $data = null, $error = null, $statusCode = 200) {
    http_response_code($statusCode);
    $response = ['success' => $success];
    if ($data !== null) {
        $response['data'] = $data;
    }
    if ($error !== null) {
        $response['error'] = $error;
    }
    echo json_encode($response);
    exit;
}

// --- Helper Function to Sanitize Filename (based on Topic) ---
function sanitize_topic_to_filename($topic) {
    if (empty($topic)) {
        // Generate a unique ID if topic is empty, though frontend should try to ensure topic is set for saving
        return 'report_' . uniqid() . '.json';
    }
    // Remove potentially harmful characters, replace spaces with underscores
    $filename = preg_replace('/[^a-zA-Z0-9_.\-]/', '', str_replace(' ', '_', $topic));
    // Prevent empty filenames after sanitization or too long filenames
    if (empty($filename)) {
        $filename = 'untitled_report_' . time();
    }
    return substr($filename, 0, 100) . '.json'; // Max length 100 chars + .json
}


// --- Main Logic ---
$action = null;
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = isset($_GET['action']) ? $_GET['action'] : null;
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Check for JSON POST data for 'save' action
    $contentType = isset($_SERVER["CONTENT_TYPE"]) ? trim($_SERVER["CONTENT_TYPE"]) : '';
    if (strpos($contentType, 'application/json') !== false) {
        $postData = json_decode(file_get_contents('php://input'), true);
        $action = isset($postData['action']) ? $postData['action'] : null;
    } else {
        $action = isset($_POST['action']) ? $_POST['action'] : null;
    }
}

if (!file_exists(DATA_DIRECTORY)) {
    if (!mkdir(DATA_DIRECTORY, 0775, true)) { // Create with rwxrwx--x permissions
        send_json_response(false, null, 'Error: Reports directory does not exist and could not be created. Please create it manually: ' . DATA_DIRECTORY, 500);
    }
}
if (!is_writable(DATA_DIRECTORY)) {
    send_json_response(false, null, 'Error: Reports directory is not writable. Please check permissions for: ' . DATA_DIRECTORY, 500);
}


switch ($action) {
    case 'list':
        $files = glob(DATA_DIRECTORY . '*.json');
        $report_topics = [];
        if ($files) {
            foreach ($files as $file) {
                // Extract topic from filename (remove .json and replace underscores with spaces for display)
                $filename_only = basename($file, '.json');
                // $topic_display = str_replace('_', ' ', $filename_only); // Simple way
                // To be more robust, store topic inside JSON and read it, or use filename as ID
                $report_topics[] = $filename_only; // For now, just send filename without .json as ID/topic
            }
        }
        send_json_response(true, $report_topics);
        break;

    case 'load':
        $topic_id = null; // This will be the filename without .json
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $topic_id = isset($_GET['topic_id']) ? $_GET['topic_id'] : null;
        } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
             $topic_id = isset($postData['topic_id']) ? $postData['topic_id'] : (isset($_POST['topic_id']) ? $_POST['topic_id'] : null);
        }

        if (empty($topic_id)) {
            send_json_response(false, null, 'Topic ID (filename) for loading is missing.', 400);
        }
        // Sanitize topic_id to prevent directory traversal, even though it's from our 'list' action.
        $filename_part = basename($topic_id); // Ensures no path components
        $filepath = DATA_DIRECTORY . $filename_part . '.json';

        if (file_exists($filepath)) {
            $json_data = file_get_contents($filepath);
            $data = json_decode($json_data, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                send_json_response(true, $data);
            } else {
                send_json_response(false, null, 'Error decoding JSON data from file: ' . $filename_part . '.json. Error: ' . json_last_error_msg(), 500);
            }
        } else {
            send_json_response(false, null, 'Report file not found: ' . htmlspecialchars($filename_part) . '.json', 404);
        }
        break;

    case 'save':
        $jsonDataToSave = null;
        $topicForFilename = null;

        if (isset($postData['jsonData']) && isset($postData['topic'])) { // Assuming JSON POST
            $jsonDataToSave = $postData['jsonData']; // This should be already a PHP array/object if json_decode worked
            $topicForFilename = $postData['topic'];
        } else { // Fallback for form-data POST, though JSON POST is preferred for complex data
            $jsonDataString = isset($_POST['jsonData']) ? $_POST['jsonData'] : null;
            if ($jsonDataString) {
                $jsonDataToSave = json_decode($jsonDataString, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                     send_json_response(false, null, 'Invalid JSON data provided for saving. Error: ' . json_last_error_msg(), 400);
                }
            }
            $topicForFilename = isset($_POST['topic']) ? $_POST['topic'] : null;
        }

        if (empty($topicForFilename)) {
            send_json_response(false, null, 'Topic is missing, cannot determine filename for saving.', 400);
        }
        if ($jsonDataToSave === null) {
            send_json_response(false, null, 'JSON data for saving is missing.', 400);
        }

        $filename = sanitize_topic_to_filename($topicForFilename);
        $filepath = DATA_DIRECTORY . $filename;

        // Convert PHP array/object back to JSON string for saving
        $jsonString = json_encode($jsonDataToSave, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (json_last_error() !== JSON_ERROR_NONE) {
            send_json_response(false, null, 'Error encoding data to JSON for saving. Error: ' . json_last_error_msg(), 500);
        }

        if (file_put_contents($filepath, $jsonString) !== false) {
            send_json_response(true, ['message' => 'Report saved successfully as ' . $filename, 'filename' => $filename]);
        } else {
            send_json_response(false, null, 'Failed to write report to file: ' . $filename, 500);
        }
        break;

    case 'delete':
        $topic_id_to_delete = null;
         if ($_SERVER['REQUEST_METHOD'] === 'POST') { // Should be POST for delete
            $topic_id_to_delete = isset($postData['topic_id']) ? $postData['topic_id'] : (isset($_POST['topic_id']) ? $_POST['topic_id'] : null);
        }

        if (empty($topic_id_to_delete)) {
            send_json_response(false, null, 'Topic ID (filename) for deletion is missing.', 400);
        }

        $filename_part_to_delete = basename($topic_id_to_delete); // Sanitize
        $filepath_to_delete = DATA_DIRECTORY . $filename_part_to_delete . '.json';

        if (file_exists($filepath_to_delete)) {
            if (unlink($filepath_to_delete)) {
                send_json_response(true, ['message' => 'Report ' . $filename_part_to_delete . '.json deleted successfully.']);
            } else {
                send_json_response(false, null, 'Failed to delete report file: ' . $filename_part_to_delete . '.json', 500);
            }
        } else {
            send_json_response(false, null, 'Report file to delete not found: ' . htmlspecialchars($filename_part_to_delete) . '.json', 404);
        }
        break;

    default:
        send_json_response(false, null, 'Invalid action specified. Valid actions are: list, load, save, delete.', 400);
        break;
}

?>
