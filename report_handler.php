<?php
header('Content-Type: application/json');
error_reporting(0); // Suppress notices for cleaner JSON, but log errors for debugging

// --- Configuration ---
define('DATA_DIRECTORY', __DIR__ . '/reports/');
// define('ALLOWED_ORIGIN', 'http://your-frontend-domain.com'); // TODO: Set for production

// --- CORS Handling (Simplified for internal tool, but consider tightening for production) ---
header("Access-Control-Allow-Origin: *"); // Allow all origins for now
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// --- Helper Function to Send JSON Response ---
function send_json_response($success, $data = null, $error = null, $statusCode = 200) {
    http_response_code($statusCode);
    $response = ['success' => $success];
    if ($data !== null) $response['data'] = $data;
    if ($error !== null) $response['error'] = $error;
    echo json_encode($response);
    exit;
}

// --- Helper Function to Sanitize Filename (based on Topic) ---
function sanitize_topic_to_filename($topic) {
    if (empty($topic)) {
        return 'report_' . time() . '_' . uniqid() . '.json'; // More unique for untitled
    }
    $filename = str_replace(' ', '_', $topic);
    $filename = preg_replace('/[^a-zA-Z0-9_.\-]/', '', $filename); // Allow alphanumeric, underscore, dot, hyphen
    $filename = trim($filename, '_.- '); // Trim leading/trailing problematic chars
    if (empty($filename) || $filename === '.json') { // Prevent just ".json" or empty after sanitize
        $filename = 'untitled_report_' . time() . '_' . uniqid();
    }
    return substr($filename, 0, 200) . '.json'; // Max length 200 chars for filename part
}

// --- Main Logic ---
$action = null;
$postData = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $contentType = isset($_SERVER["CONTENT_TYPE"]) ? trim($_SERVER["CONTENT_TYPE"]) : '';
    if (strpos($contentType, 'application/json') !== false) {
        $postData = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            send_json_response(false, null, "Invalid JSON payload: " . json_last_error_msg(), 400);
        }
        $action = isset($postData['action']) ? $postData['action'] : null;
    } else { // Form data POST
        $action = isset($_POST['action']) ? $_POST['action'] : null;
        $postData = $_POST; // Use $_POST directly for form data
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = isset($_GET['action']) ? $_GET['action'] : null;
    $postData = $_GET; // Use $_GET for GET requests (for load, list)
}


if (!file_exists(DATA_DIRECTORY)) {
    if (!mkdir(DATA_DIRECTORY, 0775, true)) {
        send_json_response(false, null, 'Error: Reports directory (' . DATA_DIRECTORY . ') does not exist and could not be created.', 500);
    }
}
if (!is_writable(DATA_DIRECTORY)) {
    send_json_response(false, null, 'Error: Reports directory (' . DATA_DIRECTORY . ') is not writable.', 500);
}

switch ($action) {
    case 'list':
        $files = glob(DATA_DIRECTORY . '*.json');
        $report_identifiers = []; // Will be an array of objects {topic_id_from_filename, actual_topic_from_json}
        if ($files) {
            foreach ($files as $file) {
                $filename_id = basename($file, '.json');
                // Try to read the actual topic from within the JSON if possible
                // This makes the list more user-friendly if filenames were heavily sanitized
                $content = @file_get_contents($file);
                $actual_topic = $filename_id; // Default to filename id
                if($content) {
                    $data = @json_decode($content, true);
                    if ($data && isset($data['topic']) && !empty($data['topic'])) {
                        $actual_topic = $data['topic'];
                    }
                }
                $report_identifiers[] = ['id' => $filename_id, 'displayTopic' => $actual_topic];
            }
        }
        send_json_response(true, $report_identifiers);
        break;

    case 'load':
        $topic_id = isset($postData['topic_id']) ? $postData['topic_id'] : null;
        if (empty($topic_id)) {
            send_json_response(false, null, 'Topic ID (filename part) for loading is missing.', 400);
        }
        $filename_part = basename($topic_id);
        $filepath = DATA_DIRECTORY . $filename_part . '.json';

        if (file_exists($filepath)) {
            $json_data_content = file_get_contents($filepath);
            $data_array = json_decode($json_data_content, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                send_json_response(true, $data_array);
            } else {
                send_json_response(false, null, 'Error decoding JSON from file: ' . $filename_part . '.json. Msg: ' . json_last_error_msg(), 500);
            }
        } else {
            send_json_response(false, null, 'Report file not found: ' . htmlspecialchars($filename_part) . '.json', 404);
        }
        break;

    case 'save':
        $jsonDataToSave = isset($postData['jsonData']) ? $postData['jsonData'] : null;
        $currentTopic = isset($postData['topic']) ? trim($postData['topic']) : null;
        $originalTopic = isset($postData['originalTopic']) ? trim($postData['originalTopic']) : null;

        if (empty($currentTopic)) {
            send_json_response(false, null, 'Current Topic is missing. Cannot determine filename for saving.', 400);
        }
        if ($jsonDataToSave === null || (!is_array($jsonDataToSave) && !is_object($jsonDataToSave))) {
            send_json_response(false, null, 'JSON data for saving is missing or not a valid structure.', 400);
        }

        // Ensure originalTopic in jsonData matches the one passed, if any, or set it.
        // The jsonData should be the source of truth for originalTopic after a rename.
        if (isset($jsonDataToSave['originalTopic']) && !empty($jsonDataToSave['originalTopic'])) {
             $originalTopic = $jsonDataToSave['originalTopic'];
        }


        // Handle rename: if originalTopic is provided, valid, and different from currentTopic
        if ($originalTopic && $originalTopic !== $currentTopic) {
            $oldFilename = sanitize_topic_to_filename($originalTopic);
            $oldFilepath = DATA_DIRECTORY . $oldFilename;
            if (file_exists($oldFilepath)) {
                if (!unlink($oldFilepath)) {
                    error_log("CRITICAL: Failed to delete old report file during rename: " . $oldFilepath . " while saving new topic " . $currentTopic);
                    // Decide if this is a fatal error for the save operation
                    // send_json_response(false, null, 'Failed to delete old report file during rename: ' . $oldFilename . '. New report NOT saved.', 500);
                } else {
                     error_log("Successfully deleted old file: " . $oldFilepath . " during rename to " . $currentTopic);
                }
            } else {
                error_log("Old file not found during rename: " . $oldFilepath . " (originalTopic: " . $originalTopic . ")");
            }
        }

        // Update originalTopic within the jsonData to be the current topic before saving
        // This ensures that if this file is loaded again, its originalTopic reflects its current filename basis
        if (is_array($jsonDataToSave)) { // Ensure it's an array to set key
            $jsonDataToSave['originalTopic'] = $currentTopic;
        } elseif (is_object($jsonDataToSave)) { // Or an object
             $jsonDataToSave->originalTopic = $currentTopic;
        }


        $newFilename = sanitize_topic_to_filename($currentTopic);
        $newFilepath = DATA_DIRECTORY . $newFilename;
        $jsonString = json_encode($jsonDataToSave, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        if (json_last_error() !== JSON_ERROR_NONE) {
            send_json_response(false, null, 'Error encoding data to JSON for saving. Msg: ' . json_last_error_msg(), 500);
        }

        if (file_put_contents($newFilepath, $jsonString) !== false) {
            send_json_response(true, ['message' => 'Report saved as ' . $newFilename, 'filename' => $newFilename, 'updatedTopic' => $currentTopic]);
        } else {
            send_json_response(false, null, 'Failed to write report to file: ' . $newFilename, 500);
        }
        break;

    case 'delete':
        $topic_id_to_delete = isset($postData['topic_id']) ? $postData['topic_id'] : null;
        if (empty($topic_id_to_delete)) {
            send_json_response(false, null, 'Topic ID (filename part) for deletion is missing.', 400);
        }

        $filename_part_to_delete = basename($topic_id_to_delete);
        // We use topic_id directly as it's based on what 'list' returned (sanitized filename part)
        // or what user has in their 'topic' field which should be sanitized client-side before sending for delete,
        // but report_handler.php should also sanitize it for safety if used directly for filename.
        // For delete, we expect the client to send the topic that was used to save the file.
        $filename_to_delete = sanitize_topic_to_filename($topic_id_to_delete);
        $filepath_to_delete = DATA_DIRECTORY . $filename_to_delete;

        if (file_exists($filepath_to_delete)) {
            if (unlink($filepath_to_delete)) {
                send_json_response(true, ['message' => 'Report ' . $filename_to_delete . ' deleted.']);
            } else {
                send_json_response(false, null, 'Failed to delete: ' . $filename_to_delete, 500);
            }
        } else {
            send_json_response(false, null, 'File to delete not found: ' . htmlspecialchars($filename_to_delete), 404);
        }
        break;

    default:
        send_json_response(false, null, 'Invalid action. Valid: list, load, save, delete.', 400);
        break;
}
?>
