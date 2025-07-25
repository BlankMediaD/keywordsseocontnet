document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFile');
    const processCsvButton = document.getElementById('processCsvButton');
    const urlEntriesContainer = document.getElementById('url-entries-container');
    const reportControlsDiv = document.getElementById('report-controls');
    const saveAllModifiedButton = document.getElementById('saveAllModifiedButton');
    const downloadAllDataButton = document.getElementById('downloadAllDataButton');
    const serpInfoButton = document.getElementById('serpInfoButton');

    let urlReportData = [];

    const serpIconMap = {
        'sponsored ads': '💰',
        'ai overview': '✨',
        'featured snippets': '📄',
        'reviews': '⭐',
        'sitelinks': '🔗',
        'people also ask': '❓',
        'images': '🖼️',
        'bottom ads': '💰🔻',
        'middle ads': '💰↔️',
        'related searches': '🔍',
        'videos': '▶️',
        'top stories': '📰',
        'knowledge panel': '🏛️',
    };
    const defaultSerpIcon = 'ℹ️';

    const clientNameOptions = ["TBGC", "TCC", "BlankAnalytica", "Other (Specify)"];
    const clientNameOtherSpecify = "Other (Specify)";

    const statuses = {
        select: "Select Status...",
        used_for_content: "Used for content",
        pending_approval: "Pending approval",
        not_usable: "Not usable",
        already_used: "Already used",
        used: "Used",
        good_to_send_for_approval: "Good to send for approval"
    };

    const statusColors = {
        select: "",
        used_for_content: "status-used-for-content",
        pending_approval: "status-pending-approval",
        not_usable: "status-not-usable",
        already_used: "status-already-used",
        used: "status-used",
        good_to_send_for_approval: "status-good-to-send-for-approval"
    };

    processCsvButton.addEventListener('click', () => {
        const file = csvFileInput.files[0];
        if (!file) {
            alert("Please upload a CSV file.");
            return;
        }
        parseCsv(file);
    });

    function parseCsv(file) {
        console.log(`[CSV Debug] Parsing CSV: ${file.name}`);
        const reader = new FileReader();
        reader.onload = (event) => {
            const csvData = event.target.result;
            console.log("[CSV Debug] CSV Data Loaded. Length:", csvData.length);
            const extractedData = [];
            const lines = csvData.split(/\r\n|\n/);
            let hasHeader = false;
            if (lines.length > 0 && lines[0].toLowerCase().includes('keyword') && lines[0].toLowerCase().includes('url')) {
                hasHeader = true;
                console.log("[CSV Debug] Header row detected.");
            }
            const startIndex = hasHeader ? 1 : 0;

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                console.log(`[CSV Debug] Processing line ${i + 1} (Row ${i + (hasHeader?2:1)}): "${line}"`);
                if (line.trim() === '') {
                    console.log(`[CSV Debug] Line ${i + 1} is empty, skipping.`);
                    continue;
                }

                const columns = parseCsvLine(line); // Use NEW robust parser
                console.log(`[CSV Debug] Line ${i + 1} parsed into columns (${columns.length}):`, JSON.stringify(columns));

                if (columns.length > 7) { // Ensure column H (index 7) is accessible
                    const keyword = columns[0]?.trim();
                    const rawUrl = columns[7]?.trim();
                    const serpAttribute = columns[6]?.trim() || '';

                    console.log(`[CSV Debug] Line ${i + 1} - Extracted Keyword: "${keyword}", RawURL: "${rawUrl}", SERP Attribute: "${serpAttribute}"`);

                    if (!rawUrl) {
                        console.warn(`[CSV Debug] Skipping line ${i + 1} (Row ${i + (hasHeader?2:1)}): URL in Column H is missing or empty. Line: "${line}"`);
                        continue;
                    }

                    if ((rawUrl.includes(' ') || !rawUrl.includes('.')) && rawUrl !== 'localhost' && !rawUrl.startsWith('localhost/')) {
                         console.warn(`[CSV Debug] Skipping line ${i + 1} (Row ${i + (hasHeader?2:1)}): Value in Column H ('${rawUrl}') does not appear to be a valid URL structure (contains space or no dot). Line: "${line}"`);
                         continue;
                    }

                    const url = sanitizeUrl(rawUrl);
                    console.log(`[CSV Debug] Line ${i + 1} - Sanitized URL: "${url}" (from Raw: "${rawUrl}")`);

                    if (!url) {
                        console.warn(`[CSV Debug] Skipping line ${i + 1} (Row ${i + (hasHeader?2:1)}): URL in Column H ('${rawUrl}') was deemed invalid after full sanitization. Line: "${line}"`);
                        continue;
                    }

                    const finalKeyword = (typeof keyword === 'string') ? keyword : '';
                    if (finalKeyword === '' && (keyword !== undefined && keyword !== null)) {
                         console.log(`[CSV Debug] Line ${i + 1} (Row ${i + (hasHeader?2:1)}): Keyword was present but empty after trim for URL '${url}'.`);
                    } else if (keyword === undefined || keyword === null) {
                        console.warn(`[CSV Debug] Line ${i + 1} (Row ${i + (hasHeader?2:1)}): Keyword in Column A is missing or undefined for URL '${url}'. Processing URL with empty keyword text.`);
                    }

                    extractedData.push({ keyword: finalKeyword, url, serpAttribute });
                    console.log(`[CSV Debug] Line ${i + 1} - Pushed to extractedData:`, { keyword: finalKeyword, url, serpAttribute });

                } else {
                    console.warn(`[CSV Debug] Skipping line ${i + 1} (Row ${i + (hasHeader?2:1)}): Not enough columns (found ${columns.length}, expected >7). Line: "${line}"`);
                }
            }

            console.log("[CSV Debug] Total raw entries extracted:", extractedData.length);
            if (extractedData.length === 0) {
                urlEntriesContainer.innerHTML = '<p class="text-center text-danger"><strong>Error:</strong> No valid data found in CSV after parsing. Check console for details.</p>';
                reportControlsDiv.style.display = 'none';
                return;
            }
            processParsedCsvData(extractedData);
        };
        reader.onerror = () => {
            console.error("[CSV Debug] FileReader error.");
            alert("Error reading file.");
        }
        reader.readAsText(file);
    }

    function parseCsvLine(line) {
        const columns = [];
        let cellBuffer = [];
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i+1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped double quote within a quoted field
                    cellBuffer.push('"');
                    i++; // Skip the second quote of the pair
                } else {
                    // Start or end of a quoted field
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Delimiter found outside of quotes
                columns.push(cellBuffer.join('').trim());
                cellBuffer = []; // Reset buffer for next cell
            } else {
                // Regular character, add to current cell buffer
                cellBuffer.push(char);
            }
        }
        // Add the last cell's content
        columns.push(cellBuffer.join('').trim());
        return columns;
    }


    function processParsedCsvData(rawCsvEntries) {
        console.log("[CSV Debug] Processing parsed CSV data. Raw entries count:", rawCsvEntries.length);
        const urlMap = rawCsvEntries.reduce((acc, entry) => {
            const { url, keyword, serpAttribute } = entry;
            if (!url) {
                console.warn("[CSV Debug] Entry with no URL found in rawCsvEntries, skipping:", entry);
                return acc;
            }

            if (!acc[url]) {
                acc[url] = {
                    url: url,
                    clientName: '', clientColor: '',
                    topic: '', originalTopic: '',
                    status: 'select',
                    keywords: [],
                    competitors: '',
                    manualContentAnalysis: { pastedSource: '', metaTitle: '', metaDescription: '', metaImage: '', wordCount: 0 },
                    isExpanded: false
                };
                console.log(`[CSV Debug] Created new map entry for URL: ${url}`);
            }

            if (keyword && keyword.trim() !== '' && !acc[url].keywords.some(kw => kw.text.toLowerCase() === keyword.toLowerCase())) {
                 acc[url].keywords.push({ text: keyword, serpAttribute: serpAttribute || '' });
                 console.log(`[CSV Debug] Added keyword "${keyword}" with SERP attribute "${serpAttribute}" to URL ${url}`);
            } else if (keyword && keyword.trim() !== '') {
                console.log(`[CSV Debug] Keyword "${keyword}" already exists for URL ${url} or is a duplicate, not adding again from this CSV row.`);
            }
            return acc;
        }, {});

        console.log("[CSV Debug] urlMap created:", urlMap);
        const newOrUpdatedEntriesFromCsv = Object.values(urlMap).map((urlData, index) => ({
            ...urlData,
            id: urlData.id || `csv-entry-${Date.now()}-${index}`
        }));

        console.log("[CSV Debug] newOrUpdatedEntriesFromCsv count:", newOrUpdatedEntriesFromCsv.length, newOrUpdatedEntriesFromCsv);

        newOrUpdatedEntriesFromCsv.forEach(csvEntry => {
            const existingEntryIndex = urlReportData.findIndex(e => e.url === csvEntry.url);
            if (existingEntryIndex > -1) {
                console.log(`[CSV Debug] Merging CSV data for URL: ${csvEntry.url} with existing server data.`);
                const existingEntry = urlReportData[existingEntryIndex];

                const existingKeywordsSet = new Set(existingEntry.keywords.map(k => k.text.toLowerCase()));
                let mergedKeywords = [...existingEntry.keywords];

                csvEntry.keywords.forEach(csvKw => {
                    if (!existingKeywordsSet.has(csvKw.text.toLowerCase())) {
                        mergedKeywords.push(csvKw);
                        console.log(`[CSV Debug] Adding new keyword "${csvKw.text}" from CSV to existing entry for ${csvEntry.url}`);
                    } else {
                        const ek = mergedKeywords.find(k => k.text.toLowerCase() === csvKw.text.toLowerCase());
                        if (ek && ek.serpAttribute !== csvKw.serpAttribute) {
                            console.log(`[CSV Debug] Updating SERP attribute for existing keyword "${csvKw.text}" for ${csvEntry.url} from "${ek.serpAttribute}" to "${csvKw.serpAttribute}"`);
                            ek.serpAttribute = csvKw.serpAttribute;
                        }
                    }
                });
                urlReportData[existingEntryIndex].keywords = mergedKeywords;
            } else {
                console.log(`[CSV Debug] Adding new URL entry from CSV: ${csvEntry.url}`);
                urlReportData.push(normalizeEntry(csvEntry));
            }
        });

        console.log("[CSV Debug] Final urlReportData after CSV processing/merging:", urlReportData.length, JSON.parse(JSON.stringify(urlReportData)));
        displayUrlsAndKeywords(urlReportData);
        reportControlsDiv.style.display = urlReportData.length > 0 ? 'block' : 'none';
    }

    function displayUrlsAndKeywords(dataToDisplay) {
        urlEntriesContainer.innerHTML = '';
        if (!dataToDisplay || dataToDisplay.length === 0) {
            urlEntriesContainer.innerHTML = '<p class="text-center text-muted">No URL entries. Load data from server or upload CSV.</p>';
            reportControlsDiv.style.display = 'none';
            return;
        }
        reportControlsDiv.style.display = 'block';

        dataToDisplay.forEach(entry => {
            const entryId = entry.id;
            const card = document.createElement('div');
            card.classList.add('card', 'url-entry', 'mb-3');
            card.setAttribute('id', `url-entry-${entryId}`);

            const clientColor = entry.clientColor || '#6c757d';
            const clientNameDisplay = entry.clientName || 'No Client';
            let keywordsHtml = '<p class="small text-muted">No keywords from CSV.</p>';
            if (entry.keywords && entry.keywords.length > 0) {
                keywordsHtml = entry.keywords.map(kw => {
                    let iconHtml = '';
                    if (kw.serpAttribute) {
                        const attributeKey = kw.serpAttribute.toLowerCase().trim();
                        let matchedIcon = defaultSerpIcon;
                        let specificMatchFound = false;
                        for (const key in serpIconMap) {
                            if (attributeKey.includes(key)) {
                                matchedIcon = serpIconMap[key];
                                specificMatchFound = true;
                                break;
                            }
                        }
                        iconHtml = `<span class="serp-icon ml-1" title="${kw.serpAttribute}">${specificMatchFound ? matchedIcon : defaultSerpIcon + ' (' + kw.serpAttribute + ')'}</span>`;
                    }
                    return `
                    <div class="keyword-item mb-1">
                        <span class="badge badge-primary keyword-text" title="Click to copy: ${kw.text}">${kw.text}</span>
                        ${iconHtml}
                    </div>`;
                }).join('');
            }

            let isOtherClientSelectedInitially = entry.clientName === clientNameOtherSpecify ||
                                               (entry.clientName && !clientNameOptions.includes(entry.clientName));
            let otherClientValueInitially = (isOtherClientSelectedInitially && entry.clientName !== clientNameOtherSpecify) ? entry.clientName : '';
            if (entry.clientName === clientNameOtherSpecify) {
                otherClientValueInitially = '';
            }

            card.innerHTML = `
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div class="url-header-main">
                        <h5 class="mb-0 url-title d-inline-block">
                            <a href="${sanitizeUrl(entry.url)}" target="_blank" title="${entry.url}">${truncateUrl(entry.url, 60)}</a>
                        </h5>
                        <span class="badge badge-pill badge-light keyword-count-badge ml-2" title="Number of unique keywords for this URL">${entry.keywords.length} Keyword(s)</span>
                        <span class="badge client-name-badge ml-1" style="background-color: ${clientColor}; color: white;" title="Client: ${clientNameDisplay}">${clientNameDisplay}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-secondary toggle-expand-button" data-entry-id="${entryId}">
                        ${entry.isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                </div>
                <div class="card-body" style="display: ${entry.isExpanded ? 'block' : 'none'};">
                    <div class="row">
                        <div class="col-md-6">
                            <h6>Associated Keywords:</h6>
                            <div class="keywords-list mb-3">${keywordsHtml}</div>
                            <div class="form-group">
                                <label for="topic-${entryId}" class="small font-weight-bold">Topic:</label>
                                <input type="text" class="form-control form-control-sm topic-input" id="topic-${entryId}" placeholder="Enter topic" data-entry-id="${entryId}" value="${entry.topic || ''}">
                            </div>
                            <div class="form-group">
                                <label for="status-${entryId}" class="small font-weight-bold">Status:</label>
                                <select class="form-control form-control-sm status-select" id="status-${entryId}" data-entry-id="${entryId}">
                                    ${Object.entries(statuses).map(([key, value]) => `<option value="${key}" ${entry.status === key ? 'selected' : ''}>${value}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="competitors-${entryId}" class="small font-weight-bold">Competitors:</label>
                                <textarea class="form-control form-control-sm competitors-input" id="competitors-${entryId}" rows="2" placeholder="Enter competitor URLs/notes" data-entry-id="${entryId}">${entry.competitors || ''}</textarea>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h6 class="small font-weight-bold">Page Analysis:</h6>
                            <button class="btn btn-sm btn-primary live-fetch-meta-button mb-2" data-entry-id="${entryId}">Fetch URL Meta (Live)</button>
                            <button class="btn btn-sm btn-outline-secondary toggle-manual-analysis-button mb-2" data-entry-id="${entryId}">Show Manual Input</button>
                            <div class="manual-analysis-section" style="display: none; border: 1px solid #eee; padding: 10px; border-radius: 5px; margin-top: 5px;">
                                <div class="form-group">
                                    <label for="pastedSource-${entryId}" class="small">Paste HTML Source:</label>
                                    <textarea class="form-control form-control-sm pasted-source-input" id="pastedSource-${entryId}" rows="3" placeholder="Paste HTML source..." data-entry-id="${entryId}">${entry.manualContentAnalysis.pastedSource || ''}</textarea>
                                    <button class="btn btn-sm btn-dark extract-meta-button mt-1" data-entry-id="${entryId}">Extract Info from Paste</button>
                                </div>
                                <div class="meta-results small">
                                    <p class="mb-1"><strong>Meta Title:</strong> <span class="meta-title-display">${entry.manualContentAnalysis.metaTitle || '-'}</span></p>
                                    <p class="mb-1"><strong>Meta Desc:</strong> <span class="meta-desc-display">${entry.manualContentAnalysis.metaDescription || '-'}</span></p>
                                    <p class="mb-1"><strong>Meta Image:</strong> <span class="meta-image-display">${entry.manualContentAnalysis.metaImage || '-'}</span></p>
                                    <p class="mb-1"><strong>Word Count:</strong> <span class="word-count-display">${entry.manualContentAnalysis.wordCount || '-'}</span></p>
                                    <button class="btn btn-sm btn-outline-info view-extracted-content-button mt-1" data-entry-id="${entryId}" ${!entry.manualContentAnalysis.metaTitle && !entry.manualContentAnalysis.metaDescription ? 'style="display:none;"' : ''}>View Details</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <hr>
                    <div class="form-group mt-2">
                        <label for="clientNameSelect-${entryId}" class="small font-weight-bold">Client Name (for this entry):</label>
                        <select class="form-control form-control-sm client-name-select" id="clientNameSelect-${entryId}" data-entry-id="${entryId}">
                            ${clientNameOptions.map(opt => {
                                let selected = false;
                                if (isOtherClientSelectedInitially && opt === clientNameOtherSpecify) {
                                    selected = true;
                                } else if (!isOtherClientSelectedInitially && entry.clientName === opt) {
                                    selected = true;
                                }
                                return `<option value="${opt}" ${selected ? 'selected' : ''}>${opt}</option>`;
                            }).join('')}
                        </select>
                        <input type="text" class="form-control form-control-sm client-name-other-input mt-1" id="clientNameOther-${entryId}" placeholder="Specify other client" data-entry-id="${entryId}" style="display: ${isOtherClientSelectedInitially ? 'block' : 'none'};" value="${otherClientValueInitially}">
                    </div>
                    <div class="mt-2">
                        <button class="btn btn-sm btn-success save-entry-button mr-2" data-entry-id="${entryId}">Save to Server</button>
                        <button class="btn btn-sm btn-danger delete-entry-button" data-entry-id="${entryId}" title="Delete this entry from server">Delete from Server</button>
                    </div>
                </div>
            `;
            urlEntriesContainer.appendChild(card);

            const currentEntryRef = urlReportData.find(item => item.id === entryId);
            card.querySelector('.toggle-expand-button').addEventListener('click', function() {
                const cardBody = card.querySelector('.card-body');
                currentEntryRef.isExpanded = !currentEntryRef.isExpanded;
                cardBody.style.display = currentEntryRef.isExpanded ? 'block' : 'none';
                this.textContent = currentEntryRef.isExpanded ? 'Collapse' : 'Expand';
            });
            card.querySelectorAll('.keyword-text').forEach(kwBadge => {
                kwBadge.addEventListener('click', () => {
                    navigator.clipboard.writeText(kwBadge.textContent)
                        .then(() => alert(`Copied "${kwBadge.textContent}" to clipboard!`))
                        .catch(err => console.error('Failed to copy keyword: ', err));
                });
            });
            card.querySelector(`#topic-${entryId}`).addEventListener('input', (e) => currentEntryRef.topic = e.target.value);
            card.querySelector(`#status-${entryId}`).addEventListener('change', (e) => {
                currentEntryRef.status = e.target.value;
                const cardBody = card.querySelector('.card-body');
                Object.values(statusColors).forEach(cls => { if (cls) cardBody.classList.remove(cls); });
                if (statusColors[currentEntryRef.status]) { cardBody.classList.add(statusColors[currentEntryRef.status]); }
            });
            if(currentEntryRef.status !== 'select') {
                card.querySelector(`#status-${entryId}`).dispatchEvent(new Event('change'));
            }
            card.querySelector(`#competitors-${entryId}`).addEventListener('input', (e) => currentEntryRef.competitors = e.target.value);

            const clientNameSelectElement = card.querySelector(`#clientNameSelect-${entryId}`);
            const clientNameOtherInputElement = card.querySelector(`#clientNameOther-${entryId}`);

            clientNameSelectElement.addEventListener('change', (e) => {
                const selectedValue = e.target.value;
                if (selectedValue === clientNameOtherSpecify) {
                    clientNameOtherInputElement.style.display = 'block';
                    currentEntryRef.clientName = clientNameOtherInputElement.value.trim();
                    clientNameOtherInputElement.focus();
                } else {
                    clientNameOtherInputElement.style.display = 'none';
                    currentEntryRef.clientName = selectedValue;
                }
                updateClientBadge(card, currentEntryRef);
            });

            clientNameOtherInputElement.addEventListener('input', (e) => {
                if (clientNameSelectElement.value === clientNameOtherSpecify) {
                    currentEntryRef.clientName = e.target.value.trim();
                    updateClientBadge(card, currentEntryRef);
                }
            });

            function updateClientBadge(cardElement, entryRef) {
                const badge = cardElement.querySelector('.client-name-badge');
                let displayName = 'No Client';
                if (entryRef.clientName) {
                    if (entryRef.clientName === clientNameOtherSpecify && clientNameOtherInputElement.value.trim() === '') {
                        displayName = 'Other (Specify)';
                    } else {
                        displayName = entryRef.clientName;
                    }
                }

                badge.textContent = displayName;
                if (entryRef.clientName && entryRef.clientName.trim() && entryRef.clientName !== clientNameOtherSpecify && !entryRef.clientColor) {
                    entryRef.clientColor = getRandomColor();
                } else if (!entryRef.clientName || !entryRef.clientName.trim() || (entryRef.clientName === clientNameOtherSpecify && clientNameOtherInputElement.value.trim() === '')) {
                    entryRef.clientColor = '';
                }
                badge.style.backgroundColor = entryRef.clientColor || '#6c757d';
            }
            updateClientBadge(card, currentEntryRef);


            const liveFetchButton = card.querySelector('.live-fetch-meta-button');
            const manualAnalysisSection = card.querySelector('.manual-analysis-section');
            const toggleManualButton = card.querySelector('.toggle-manual-analysis-button');
            const extractMetaButton = card.querySelector('.extract-meta-button');
            const pastedSourceTextarea = card.querySelector(`#pastedSource-${entryId}`);
            const viewExtractedDetailsButton = card.querySelector('.view-extracted-content-button');

            if (toggleManualButton) {
                toggleManualButton.addEventListener('click', function() {
                    const isHidden = manualAnalysisSection.style.display === 'none';
                    manualAnalysisSection.style.display = isHidden ? 'block' : 'none';
                    this.textContent = isHidden ? 'Hide Manual Input' : 'Show Manual Input';
                });
            }

            if (liveFetchButton) {
                liveFetchButton.addEventListener('click', () => {
                    if (!currentEntryRef.url) {
                        alert("No URL defined for this entry to fetch metadata.");
                        return;
                    }
                    liveFetchButton.disabled = true;
                    liveFetchButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Fetching...';

                    fetchUrlMetadataWithPHP(currentEntryRef.url, currentEntryRef.manualContentAnalysis, card)
                        .finally(() => {
                            liveFetchButton.disabled = false;
                            liveFetchButton.textContent = 'Fetch URL Meta (Live)';
                        });
                });
            }

            if (extractMetaButton) {
                extractMetaButton.addEventListener('click', () => {
                    const pastedSource = pastedSourceTextarea.value;
                    if (!pastedSource.trim()) {
                        alert("Please paste HTML source into the textarea first.");
                        return;
                    }
                    currentEntryRef.manualContentAnalysis.pastedSource = pastedSource;
                    extractMetaFromSource(pastedSource, currentEntryRef.manualContentAnalysis, card);
                    viewExtractedDetailsButton.style.display = (currentEntryRef.manualContentAnalysis.metaTitle || currentEntryRef.manualContentAnalysis.metaDescription) ? 'inline-block' : 'none';
                });
            }

            if (viewExtractedDetailsButton) {
                viewExtractedDetailsButton.addEventListener('click', () => {
                    populateAndShowContentModal(currentEntryRef.manualContentAnalysis);
                });
            }

            card.querySelector('.save-entry-button').addEventListener('click', () => saveSingleEntryReport(entryId));
            const deleteButton = card.querySelector('.delete-entry-button');
            if(deleteButton) {
                deleteButton.addEventListener('click', async () => {
                    deleteButton.disabled = true;
                    const success = await deleteEntryFromServer(entryId);
                    if (!success && document.getElementById(`url-entry-${entryId}`)) {
                         deleteButton.disabled = false;
                    }
                });
            }
        });
    }

    async function fetchUrlMetadataWithPHP(urlToFetch, analysisObject, cardElement) {
        console.log(`Fetching metadata for: ${urlToFetch} via PHP proxy`);
        const manualAnalysisSection = cardElement ? cardElement.querySelector('.manual-analysis-section') : null;
        const toggleManualButton = cardElement ? cardElement.querySelector('.toggle-manual-analysis-button') : null;
        try {
            const formData = new FormData();
            formData.append('url', urlToFetch);
            const response = await fetch('fetch_url_meta.php', { method: 'POST', body: formData });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`PHP proxy request failed: ${response.status} ${response.statusText}. Response: ${errorText}`);
            }
            const result = await response.json();
            if (result.success && result.data) {
                analysisObject.metaTitle = result.data.metaTitle || '';
                analysisObject.metaDescription = result.data.metaDescription || '';
                analysisObject.metaImage = result.data.metaImage || '';
                analysisObject.wordCount = result.data.wordCount || 0;
                analysisObject.pastedSource = '';
                if (cardElement) {
                    const pastedSourceTextarea = cardElement.querySelector(`#pastedSource-${cardElement.id.replace('url-entry-','')}`);
                    if(pastedSourceTextarea) pastedSourceTextarea.value = '';
                    cardElement.querySelector('.meta-title-display').textContent = analysisObject.metaTitle || '-';
                    cardElement.querySelector('.meta-desc-display').textContent = analysisObject.metaDescription || '-';
                    cardElement.querySelector('.meta-image-display').textContent = analysisObject.metaImage || '-';
                    cardElement.querySelector('.word-count-display').textContent = analysisObject.wordCount || '-';
                    const viewButton = cardElement.querySelector('.view-extracted-content-button');
                    viewButton.style.display = (analysisObject.metaTitle || analysisObject.metaDescription) ? 'inline-block' : 'none';
                    if (manualAnalysisSection) manualAnalysisSection.style.display = 'none';
                    if (toggleManualButton) toggleManualButton.textContent = 'Show Manual Input';
                }
                alert(`Successfully fetched metadata for ${urlToFetch}`);
            } else {
                let errorMessage = result.error || 'Unknown error from PHP metadata fetcher.';
                if (result.data?.httpStatusCode) errorMessage += ` (Source HTTP Status: ${result.data.httpStatusCode})`;
                else if (result.httpStatusCode) errorMessage += ` (Proxy HTTP Status: ${result.httpStatusCode})`;
                alert(`Failed to fetch metadata: ${errorMessage}`);
                console.error("PHP metadata fetch error:", result);
                if (manualAnalysisSection) manualAnalysisSection.style.display = 'block';
                if (toggleManualButton) toggleManualButton.textContent = 'Hide Manual Input';
            }
        } catch (error) {
            console.error('Error calling fetch_url_meta.php:', error);
            alert(`Error fetching metadata: ${error.message}. Check console. Manual paste is available.`);
             if (manualAnalysisSection) manualAnalysisSection.style.display = 'block';
             if (toggleManualButton) toggleManualButton.textContent = 'Hide Manual Input';
        }
    }

    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
        return color;
    }

    function extractMetaFromSource(htmlString, analysisObject, cardElement) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        analysisObject.metaTitle = doc.querySelector('title')?.textContent.trim() ||
                                   doc.querySelector('meta[name="title"]')?.getAttribute('content')?.trim() ||
                                   doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';
        analysisObject.metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
                                         doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || '';
        analysisObject.metaImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ||
                                   doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() || '';
        const bodyText = doc.body?.textContent || "";
        analysisObject.wordCount = bodyText.replace(/\s+/g, ' ').trim().split(' ').filter(String).length;
        if (cardElement) {
            cardElement.querySelector('.meta-title-display').textContent = analysisObject.metaTitle || '-';
            cardElement.querySelector('.meta-desc-display').textContent = analysisObject.metaDescription || '-';
            cardElement.querySelector('.meta-image-display').textContent = analysisObject.metaImage || '-';
            cardElement.querySelector('.word-count-display').textContent = analysisObject.wordCount || '-';
            if(analysisObject.metaTitle || analysisObject.metaDescription) {
                 cardElement.querySelector('.view-extracted-content-button').style.display = 'inline-block';
            }
        }
    }

    function populateAndShowContentModal(analysisData) {
        document.getElementById('modalMetaTitle').querySelector('span').textContent = analysisData.metaTitle || 'N/A';
        document.getElementById('modalMetaDescription').querySelector('span').textContent = analysisData.metaDescription || 'N/A';
        const imgElement = document.getElementById('modalMetaImage');
        const imgUrlSpan = document.getElementById('modalMetaImageUrl');
        imgElement.style.display = 'none';
        imgUrlSpan.textContent = 'N/A';
        imgElement.removeAttribute('src');
        imgElement.onerror = function() {
            imgUrlSpan.textContent = `Failed to load image (access denied or not found): ${this.src}`;
            this.style.display = 'none';
            this.onerror = null;
        };

        if (analysisData.metaImage) {
            const sanitizedImgUrl = sanitizeUrl(analysisData.metaImage);
            if (sanitizedImgUrl) {
                imgElement.src = sanitizedImgUrl;
                imgElement.style.display = 'block';
                imgUrlSpan.textContent = sanitizedImgUrl;
            } else {
                 imgUrlSpan.textContent = 'Invalid image URL provided.';
            }
        }
        document.getElementById('modalWordCount').querySelector('span').textContent = analysisData.wordCount || 'N/A';

        const pastedSourcePreviewElement = document.getElementById('modalPastedSourcePreview');
        if (pastedSourcePreviewElement) {
            pastedSourcePreviewElement.textContent = analysisData.pastedSource
                ? analysisData.pastedSource.substring(0, 1000) + (analysisData.pastedSource.length > 1000 ? '...' : '')
                : 'No source pasted.';
        }

        $('#contentDisplayModal').modal('show');
    }


    function truncateUrl(url, maxLength = 60) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + "...";
    }

    function sanitizeUrl(url) {
        if (typeof url !== 'string') return '';
        let cleanUrl = url.replace(/^"|"$/g, '').trim();
        if (!cleanUrl) return '';
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleanUrl)) {
            try { new URL(cleanUrl); return cleanUrl; }
            catch (e) { console.warn(`sanitizeUrl: Invalid URL structure: '${cleanUrl}'`, e.message); return ''; }
        }
        if (cleanUrl.includes('  ') || cleanUrl.length > 2000) {
             console.warn(`sanitizeUrl: '${cleanUrl}' non-URL string or too long.`); return '';
        }
        if (!cleanUrl.match(/^https?:\/\//i)) {
            if (cleanUrl.toLowerCase().includes(" ads") || cleanUrl.toLowerCase().includes(" top ")) {
                console.warn(`sanitizeUrl: '${cleanUrl}' seems like ad string.`); return '';
            }
            try { new URL(`http://${cleanUrl}`); return `http://${cleanUrl}`; }
            catch (e) { console.warn(`sanitizeUrl: Not valid URL '${cleanUrl}' with http://`,e.message); return ''; }
        }
        return cleanUrl;
    }

    async function saveSingleEntryReport(entryId) {
        const entryToSave = urlReportData.find(item => item.id === entryId);
        if (!entryToSave) { alert("Error: Could not find entry to save locally."); return; }
        if (!entryToSave.topic || entryToSave.topic.trim() === '') {
            alert("Please set a Topic for this entry before saving to server.");
            const cardElement = document.getElementById(`url-entry-${entryId}`);
            if (cardElement) cardElement.querySelector('.topic-input')?.focus();
            return;
        }
        if (entryToSave.clientName && entryToSave.clientName.trim() && !entryToSave.clientColor) {
            entryToSave.clientColor = getRandomColor();
            const cardElement = document.getElementById(`url-entry-${entryId}`);
            if (cardElement) {
                const badge = cardElement.querySelector('.client-name-badge');
                if (badge) badge.style.backgroundColor = entryToSave.clientColor;
            }
        }
        const saveButton = document.querySelector(`.save-entry-button[data-entry-id="${entryId}"]`);
        if(saveButton) { saveButton.disabled = true; saveButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...'; }

        const payload = {
            action: 'save',
            topic: entryToSave.topic,
            originalTopic: (entryToSave.originalTopic && entryToSave.originalTopic !== entryToSave.topic) ? entryToSave.originalTopic : null,
            jsonData: entryToSave
        };

        try {
            const response = await fetch('report_handler.php', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) { const errorText = await response.text(); throw new Error(`Server save failed: ${response.status} ${errorText}`); }
            const result = await response.json();
            if (result.success) {
                alert(`Entry for topic "${entryToSave.topic}" saved to server! Filename: ${result.data?.filename || 'N/A'}`);
                entryToSave.originalTopic = entryToSave.topic;
            } else { throw new Error(result.error || 'Unknown error saving to server.'); }
        } catch (error) { console.error('Error saving entry:', error); alert(`Failed to save: ${error.message}`); }
        finally { if(saveButton) { saveButton.disabled = false; saveButton.innerHTML = 'Save to Server'; } }
    }

    function getTLDFromUrl(url) {
        try {
            const hostname = new URL(sanitizeUrl(url)).hostname;
            const parts = hostname.split('.');
            if (parts.length > 1) return parts[parts.length - 2];
            return parts[0];
        } catch (e) { console.error("Error parsing URL for TLD:", e); return null; }
    }

    function triggerJsonDownload(jsonData, filename) {
        const blob = new Blob([jsonData], { type: 'application/json' });
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl; a.download = filename; document.body.appendChild(a);
        a.click(); document.body.removeChild(a); URL.revokeObjectURL(dlUrl);
        console.log("JSON downloaded as:", filename);
    }

    saveAllModifiedButton.addEventListener('click', async () => {
        const modifiedEntries = urlReportData.filter(entry =>
            entry.topic?.trim() !== '' &&
            (entry.status !== 'select' || entry.clientName?.trim() !== '' ||
             entry.competitors?.trim() !== '' || entry.manualContentAnalysis?.pastedSource?.trim() !== '')
        );
        if (modifiedEntries.length === 0) {
            alert("No entries have a Topic and are modified for saving."); return;
        }
        saveAllModifiedButton.disabled = true;
        saveAllModifiedButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving ${modifiedEntries.length}...`;
        let successCount = 0, errorCount = 0;
        for (const entry of modifiedEntries) {
            const payload = {
                action: 'save',
                topic: entry.topic,
                jsonData: entry
            };
            if (entry.originalTopic && entry.originalTopic !== entry.topic) {
                payload.originalTopic = entry.originalTopic;
            }

            try {
                const response = await fetch('report_handler.php', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (response.ok && result.success) {
                    successCount++;
                    entry.originalTopic = entry.topic;
                } else {
                    errorCount++;
                    console.error(`Failed to save topic "${entry.topic}":`, result.error || response.statusText);
                }
            } catch (err) {
                errorCount++;
                console.error(`Error saving topic "${entry.topic}":`, err);
            }
        }
        saveAllModifiedButton.disabled = false; saveAllModifiedButton.textContent = 'Save All Modified to Server';
        alert(`Save process: ${successCount} succeeded, ${errorCount} failed.`);
        if (errorCount > 0) alert("Some entries failed. Check console.");
    });

    downloadAllDataButton.addEventListener('click', () => {
        if (urlReportData.length === 0) { alert("No data to download."); return; }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_all_data_${timestamp}.json`;
        triggerJsonDownload(JSON.stringify(urlReportData, null, 2), filename);
        alert(`All ${urlReportData.length} entries downloaded!`);
    });

    document.querySelectorAll('.custom-file-input').forEach(input => {
        input.addEventListener('change', function(e) {
            const fileName = e.target.files[0]?.name || "Choose CSV...";
            const nextSibling = e.target.nextElementSibling;
            if (nextSibling) nextSibling.innerText = fileName;
        });
    });

    if (serpInfoButton) {
        serpInfoButton.addEventListener('click', () => {
            const legendList = document.getElementById('serpLegendList');
            if (!legendList) { console.error("SERP Legend list element not found."); return; }
            legendList.innerHTML = '';
            for (const key in serpIconMap) {
                const li = document.createElement('li');
                li.innerHTML = `<span class="serp-icon-legend">${serpIconMap[key]}</span>: ${capitalizeFirstLetters(key)}`;
                legendList.appendChild(li);
            }
            const liDef = document.createElement('li');
            liDef.innerHTML = `<span class="serp-icon-legend">${defaultSerpIcon}</span>: Other (text shown)`;
            legendList.appendChild(liDef);
            $('#serpLegendModal').modal('show');
        });
    }

    function capitalizeFirstLetters(str) {
        return str.replace(/\b\w/g, char => char.toUpperCase());
    }

    async function loadInitialReportsFromServer() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        try {
            const response = await fetch('report_handler.php?action=list');
            if (!response.ok) throw new Error(`List reports failed: ${response.statusText}`);
            const listResult = await response.json();
            if (listResult.success && Array.isArray(listResult.data) && listResult.data.length > 0) {
                let allLoadedEntries = [];
                for (const topicData of listResult.data) {
                    const topicId = topicData.id;
                    const loadResp = await fetch(`report_handler.php?action=load&topic_id=${encodeURIComponent(topicId)}`);
                    if (!loadResp.ok) { console.error(`Load failed for ${topicId}`); continue; }
                    const reportRes = await loadResp.json();
                    if (reportRes.success && reportRes.data) {
                        let entries = Array.isArray(reportRes.data) ? reportRes.data : [reportRes.data];
                        allLoadedEntries.push(...entries.map((e, i) => {
                            const normalized = normalizeEntry(e, `server-${topicId}-${i}`);
                            if(normalized) {
                                normalized.originalTopic = topicId;
                                if (topicData.displayTopic && normalized.topic !== topicData.displayTopic) {
                                }
                            }
                            return normalized;
                        }).filter(Boolean));
                    } else console.error(`Error loading ${topicId}:`, reportRes.error);
                }
                if (allLoadedEntries.length > 0) {
                    urlReportData = allLoadedEntries;
                    displayUrlsAndKeywords(urlReportData);
                    console.log(`${urlReportData.length} entries from server.`);
                } else { displayUrlsAndKeywords([]); console.log("No valid entries from server."); }
            } else if (listResult.success) { displayUrlsAndKeywords([]); console.log("No reports on server."); }
            else { console.error("Failed to list reports:", listResult.error); displayUrlsAndKeywords([]); }
        } catch (error) { console.error('Initial server load error:', error); alert(`Reports load error: ${error.message}`); displayUrlsAndKeywords([]); }
        finally { if (loadingIndicator) loadingIndicator.style.display = 'none'; }
    }

    function normalizeEntry(entry, defaultIdPrefix = 'loaded-url-entry') {
        if (!entry || typeof entry !== 'object') return null;
        const newEntry = {
            id: entry.id || `${defaultIdPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            url: sanitizeUrl(entry.url || ''),
            clientName: entry.clientName || '',
            clientColor: entry.clientColor || (entry.clientName ? getRandomColor() : ''),
            topic: entry.topic || '',
            originalTopic: entry.originalTopic || entry.topic || '',
            status: entry.status || 'select',
            keywords: Array.isArray(entry.keywords) ? entry.keywords.map(kw => ({ text: kw.text || '', serpAttribute: kw.serpAttribute || '' })) : [],
            competitors: entry.competitors || '',
            manualContentAnalysis: {
                pastedSource: entry.manualContentAnalysis?.pastedSource || '',
                metaTitle: entry.manualContentAnalysis?.metaTitle || '',
                metaDescription: entry.manualContentAnalysis?.metaDescription || '',
                metaImage: entry.manualContentAnalysis?.metaImage || '',
                wordCount: entry.manualContentAnalysis?.wordCount || 0,
            },
            isExpanded: typeof entry.isExpanded === 'boolean' ? entry.isExpanded : false
        };
        if (!newEntry.url) { console.warn("Normalized entry missing URL:", entry); return null; }
        return newEntry;
    }

    // Initial load trigger
    loadInitialReportsFromServer();
});

[end of script.js]

[end of script.js]

[end of script.js]

[end of script.js]

[end of script.js]
