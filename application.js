"use strict";
/*
Stix2viz and visjs are packaged in a way that makes them work as Jupyter
notebook extensions.  Part of the extension installation process involves
copying them to a different location, where they're available via a special
"nbextensions" path.  This path is hard-coded into their "require" module
IDs.  Perhaps it's better to use abstract names, and add special config
in all cases to map the IDs to real paths, thus keeping the modules free
of usage-specific hard-codings.  But packaging in a way I know works in
Jupyter (an already complicated environment), and having only this config
here, seemed simpler.  At least, for now.  Maybe later someone can structure
these modules and apps in a better way.
*/
require.config({
    paths: {
      "nbextensions/stix2viz/vis-network": "stix2viz/visjs/vis-network"
    }
});

const ACTIVE_LOGS_KEY = 'active_logs';
const RAW_LOGS_KEY = 'raw_logs';
const backendUrl = 'http://localhost:3000'; //TODO: unhardcode this
const stixdedup = 'tetrastix';
const stixindiv = 'tetra_bundle';
let logsPerPage = 5;

let selectedRedisTable = stixdedup;

require(["domReady!", "stix2viz/stix2viz/stix2viz"], function (document, stix2viz) {
  

    async function getRedisKeys(tableName) {
        try {
            const response = await fetch(`${backendUrl}/redis-keys?table=${tableName}`);
            const keys = await response.json();
            const selectElement = document.getElementById('redisKeys');
            selectElement.innerHTML = ''; // Clear existing options
    
            keys.forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.text = key;
                selectElement.add(option);
            });
            return keys;
        } catch (err) {
            console.error("Error fetching Redis keys:", err);
            throw err;
        }
    }

    async function getStixBundle(key,tableName) {
        try {
            const response = await fetch(`${backendUrl}/stix-bundle/${key}?table=${tableName}`);
            const data = await response.json();
            return data;
        } catch (err) {
            console.error("Error fetching STIX bundle:", err);
            throw err;
        }
    }
    const tableSelect = document.createElement('select');
    tableSelect.id = 'redisTables';

    const tableOptions = [stixdedup, stixindiv];

    tableOptions.forEach(tableName => {
        const option = document.createElement('option');
        option.value = tableName;
        option.text = tableName;
        tableSelect.add(option);
    });

    const keySelectContainer = document.getElementById('redisKeys').parentNode;
    keySelectContainer.insertBefore(tableSelect, document.getElementById('redisKeys'));

    getRedisKeys(selectedRedisTable)
    .catch(err => console.error("Initial key population failed:", err));
    tableSelect.addEventListener('change', () => {
        selectedRedisTable = tableSelect.value;
        getRedisKeys(selectedRedisTable); 
    }); 

    document.getElementById('reload-tetra').addEventListener('click', async () => {
        try {
            const response = await fetch(`${backendUrl}/reload-tetra`);  
            if (!response.ok) {
                const message = `Error reloading Tetragon logs: ${response.status} ${response.statusText}`;
                console.error(message);
                alert(message); 
                return;  
            }
            const data = await response.json();
            console.log(data.message); 
            displayRawLogs();
            displayActiveLogs();
            
        } catch (error) {
            console.error("Error during fetch:", error);
            alert("An error occurred while reloading logs.");
        }
    });
    document.getElementById('visualizeButton').addEventListener('click', async () => {
        const selectedKey = document.getElementById('redisKeys').value;
        const stixBundle = await getStixBundle(selectedKey, selectedRedisTable);
        let customConfig = document.getElementById('paste-area-custom-config').value;
        vizStixWrapper(stixBundle, customConfig);
        linkifyHeader();
    });
    document.getElementById('log-table').addEventListener('dragover', function (event) {
        if (event.target.tagName === 'UL') {
            allowDrop(event);
        }
    });

    document.getElementById('log-table').addEventListener('drop', function (event) {
        if (event.target.tagName === 'UL') {
            dropLog(event);
        }
    });

    function allowDrop(ev) { ev.preventDefault(); }

    function dragLog(ev) {
        ev.dataTransfer.setData("text", ev.target.id);
    }
    document.getElementById('logs-per-page').addEventListener('change', (event) => {
        logsPerPage = parseInt(event.target.value, 10); //Correctly parse the selection to a base 10 number
            displayRawLogs();
            displayActiveLogs();
    });
    document.getElementById('add-all-logs').addEventListener('click', async () => {
        await fetch(`${backendUrl}/add-all-logs`);
        displayRawLogs();
        displayActiveLogs();
    });
    document.getElementById('rm-all-logs').addEventListener('click', async () => {
        await fetch(`${backendUrl}/rm-all-logs`);
        displayRawLogs();
        displayActiveLogs();
    });
      
// Persist data to MongoDB (call this when the user confirms)
async function persistToMongoDB() {
    try {
        const response = await fetch(`${backendUrl}/persist-to-mongodb`, { method: 'POST' }); // New endpoint
        if (!response.ok) {
            throw new Error(`Failed to persist data: ${response.statusText}`);
        }
        const result = await response.json();

        console.log(result.message); // "Data persisted to MongoDB"


    } catch (error) {
        // Handle errors
        console.error("Error persisting to MongoDB:", error);
    }
}

async function cloneAttackBundle(bundleData) {  
    console.log("Not implemented");    
}


async function displayAttackBundles() {
    const response = await fetch(`${backendUrl}/attack-bundles`);
    const bundles = await response.json();

    const tableBody = document.querySelector('#attack-patterns-table tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    bundles.forEach(bundle => {
        const row = tableBody.insertRow();
        const idCell = row.insertCell();
        const patternCell = row.insertCell();
        const actionsCell = row.insertCell();


        idCell.textContent = bundle.id;
        patternCell.textContent = JSON.stringify(bundle.data); 

        // Edit button
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => {
          editAttackBundle(bundle); 
        });
        actionsCell.appendChild(editButton);

        // Clone button
        const cloneButton = document.createElement('button');
        cloneButton.textContent = 'Clone';
        cloneButton.addEventListener('click', () => { 
            cloneAttackBundle(bundle.data); 
        } );
        actionsCell.appendChild(cloneButton);

        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
            deleteAttackBundle(bundle.id);
        });
        actionsCell.appendChild(deleteButton);

    });
}

document.getElementById('add-pattern').addEventListener('click', () => {
    addAttackBundle(); 
}); 

async function addAttackBundle(bundle)
{
    const editArea = document.getElementById('edit-pattern-area');
    const editText = document.getElementById('edit-pattern-text');
    const addButton = document.getElementById('add-pattern');
    const modifyButton = document.getElementById('add-modify-pattern');
    addButton.style.display = 'block';

    editArea.style.display = 'block';
    const res =  await fetch(`${backendUrl}/attack-bundle-max`);
    const nextID = String(await res.json() +1) ;

    let emptybundle = {
        "type": "bundle",
        "id": nextID,
        "name": "NAME",
        "version": "1.0.0",
        "spec_version": "2.1",
        "objects": [
          {
            "type": "attack-pattern",
            "id": "attack-pattern--NAME",
            "name": "NAME",
            "description": "description"
           },
           {
             "type": "indicator",
             "id": "indicator--NAME",
             "name": "",
             "description": "Detecting ",
             "pattern": "[process:command_line MATCHES 'ln -s' AND process:command_line MATCHES '/var/log']",
             "pattern_type": "stix",
             "valid_from": "2024-01-01T00:00:00Z"
           },
           {
             "type": "relationship",
             "id": "relationship--NAME",
             "relationship_type": "indicates",
             "source_ref": "indicator--NAME",
             "target_ref": "attack-pattern--NAME"
           }
        ]};
    editText.value = JSON.stringify(emptybundle, null, 2); // Format nicely for editing



    modifyButton.onclick = async () => {
        try {

            const formattedBundles = {
                id: nextID , 
                data: JSON.parse(editText.value) 
            };
             
            const response = await fetch(`${backendUrl}/modify-attack-bundles`, { // New endpoint for modification
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formattedBundles)
            });

            if (!response.ok) {
                throw new Error(`Failed to add bundle: ${response.statusText}`);
            }
            displayAttackBundles(); // Refresh the table to show changes
            editArea.style.display = 'none'; // Hide the edit area again
            editText.value = '';

        } catch (err) {
            console.error("Error adding bundle:", err);
            alert(`Error adding attack pattern:\n ${err}`); // User-friendly error message
        }
    }
}


async function editAttackBundle(bundle)
{
    const editArea = document.getElementById('edit-pattern-area');
    const editText = document.getElementById('edit-pattern-text');
    const modifyButton = document.getElementById('modify-pattern');

    editArea.style.display = 'block';
    editText.value = JSON.stringify(bundle.data, null, 2); // Format nicely for editing

    modifyButton.onclick = async () => {
        try {

            const formattedBundles = {
                id: bundle.id,
                data: JSON.parse(editText.value) 
            };
             
            const response = await fetch(`${backendUrl}/modify-attack-bundles`, { // New endpoint for modification
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formattedBundles)
            });

            if (!response.ok) {
                throw new Error(`Failed to modify bundle: ${response.statusText}`);
            }
            displayAttackBundles(); // Refresh the table to show changes
            editArea.style.display = 'none'; // Hide the edit area again
            editText.value = '';

        } catch (err) {
            console.error("Error modifying bundle:", err);
            alert(`Error modifying attack pattern:\n ${err}`); 
        }
    }
}


async function deleteAttackBundle(bundleId)
{
    try{
        const response = await fetch(`${backendUrl}/delete-attack-bundles`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: {id:bundleId}})
        });
        if (!response.ok) {
            throw new Error(`Failed to delete bundle: ${response.statusText}`);
        }
        displayAttackBundles();
    } catch (err) {
        console.error("Error deleting bundle:", err);
        alert(`Error deleting attack pattern:\n ${err}`); 
    }
}

document.getElementById('refresh-patterns').addEventListener('click', displayAttackBundles);
document.getElementById('persist-patterns').addEventListener('click', persistToMongoDB);

displayAttackBundles();

    let view = null;
    let uploader = document.getElementById('uploader');
    let canvasContainer = document.getElementById('canvas-container');
    let canvas = document.getElementById('canvas');

    function alertException(exc, initialMessage=null)
    {
        let messages = [];

        if (initialMessage)
            messages.push(initialMessage);

        messages.push(exc.toString());

        while (exc instanceof Error && exc.cause)
        {
            exc = exc.cause;
            messages.push(exc.toString());
        }

        let message = messages.join("\n\n    Caused by:\n\n");

        alert(message);
    }


async function displayRawLogs(page = 1) {
    try {
        const response = await fetch(`${backendUrl}/raw-logs?page=${page}&perPage=${logsPerPage}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch raw logs: ${response.statusText}`);
        }
        const rawLogs = await response.json();
        const rawLogsList = document.getElementById('raw-logs-list');
        
        rawLogsList.innerHTML = ''; 


    rawLogs.logs.forEach(log => {
        const li = document.createElement('li');
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        try {
            const logObj = JSON.parse(log);
            const formattedLog = JSON.stringify(logObj, null, 2); 
            const pre = document.createElement('pre');
            pre.textContent = formattedLog;
            summary.textContent = logObj.dedup; 
            details.appendChild(pre);
        } catch (e) {  
            console.error("Non-json log:", log);
            details.textContent = log; 
        }

        details.appendChild(document.createElement('br'));


        li.appendChild(summary);
        li.appendChild(details);
        li.draggable = true; 
        li.id = log;
        li.ondragstart = dragLog; 
        rawLogsList.appendChild(li);
   
    updatePagination(rawLogs.page, rawLogs.perPage, rawLogs.total, 'raw-logs-list');
    });
    } catch (error) {
        console.error("Error fetching raw logs:", error);
    }
    
};

async function displayActiveLogs(page = 1) {
    try {
        const response = await fetch(`${backendUrl}/active-logs?page=${page}&perPage=${logsPerPage}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch raw logs: ${response.statusText}`);
        }
        const actLogs = await response.json();
        const actLogsList = document.getElementById('active-logs-list');
        actLogsList.innerHTML = '';
    

    actLogs.logs.forEach(log => {
        const li = document.createElement('li');
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        try {
            const logObj = JSON.parse(log);
            const formattedLog = JSON.stringify(logObj, null, 2); 
            const pre = document.createElement('pre');
            summary.textContent = logObj.dedup; 
            pre.textContent = formattedLog;
            details.appendChild(pre);
        } catch (e) {  
            console.error("Non-json log:", log);
            details.textContent = log; 
        }

        details.appendChild(document.createElement('br'));

        li.appendChild(summary);
        li.appendChild(details);
        li.draggable = true; 
        li.id = log;
        li.ondragstart = dragLog; 
        actLogsList.appendChild(li);
    
    updatePagination(actLogs.page, actLogs.perPage, actLogs.total,'active-logs-list');
});
}
    catch (error) {
        console.error("Error fetching active logs:", error);
    }
}


const rawLogsDiv = document.getElementById('raw-logs');
const activeLogsDiv = document.getElementById('active-logs');
const rawLogsList = document.getElementById('raw-logs-list');
const activeLogsList = document.getElementById('active-logs-list');
rawLogsDiv.addEventListener('drop', dropLog);
activeLogsDiv.addEventListener('drop', dropLog);
rawLogsDiv.addEventListener('dragover', allowDrop);
activeLogsDiv.addEventListener('dragover', allowDrop);
rawLogsList.addEventListener('drop', dropLog);
rawLogsList.addEventListener('dragover', allowDrop);
activeLogsList.addEventListener('drop', dropLog);
activeLogsList.addEventListener('dragover', allowDrop);
// Initial display of logs
displayRawLogs().catch(err => console.error('Failed to raw logs initially:', err));;
displayActiveLogs().catch(err => console.error('Failed to active logs initially:', err));;

async function dropLog(ev) {
    ev.preventDefault();
    const logID = ev.dataTransfer.getData("text");
    const targetListId = ev.target.closest('ul').id;
    if (targetListId === 'raw-logs-list') {
        await fetch(`${backendUrl}/rem-log?id=${logID}`);
    } else {
       await fetch(`${backendUrl}/add-log?id=${logID}`);
    }
    
    displayRawLogs();
    displayActiveLogs();
}

async function displayTransformedLogs(page = 1, perPage = 5) { 
    try {

        const keys = await getRedisKeys(selectedRedisTable); 

        const startIndex = (page - 1) * perPage;
        const endIndex = Math.min(startIndex + perPage - 1, keys.length - 1);
        const keysToDisplay = keys.slice(startIndex, endIndex + 1);


        const transformedLogsContainer = document.getElementById('transformed-logs-container');

        // TODO - Display some of the transformed logs to show the user

    } catch (error) {
        console.error("Error displaying transformed logs:", error);
    }
}

async function transformToStix() {
    let rediskey =ACTIVE_LOGS_KEY ;
    rediskey      = document.getElementById('redisKey').value;
    try {
        await fetch(`${backendUrl}/stix-transform?queue=${rediskey}`);
        await displayTransformedLogs();
    } catch (error) {
        console.error("Error transforming logs:", error);
    }
}


document.getElementById('TransformToStix').addEventListener('click', async () => {
    await transformToStix();
});
document.getElementById('baseline-all-logs').addEventListener('click', async () => {
    try {
        await fetch(`${backendUrl}/baseline-init-all`);
        displayRawLogs();
        displayActiveLogs();
    } catch (error) {
        console.error("Error transforming logs:", error);
    }
});

function updatePagination(page, perPage, total, listId) {
    const paginationId = (listId === 'raw-logs-list') ? 'pagination-raw' : 'pagination-active'; // Determine pagination ID
    const pagination = document.getElementById(paginationId); 
    pagination.innerHTML = ''; 

    const totalPages = Math.ceil(total / perPage);

    if (totalPages > 0) {
        addPageButton(1, page, pagination);

        if (totalPages > 1) {
            addPageButton(2, page, pagination);
        }
        if (totalPages > 2 && page < totalPages )
        {
        const prevButton = document.createElement('button');
        prevButton.textContent = 'Previous';
        prevButton.disabled = (page === 1);
        prevButton.addEventListener('click', () => displayRawLogs(page - 1));
        pagination.appendChild(prevButton);


        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next';
        nextButton.disabled = (page === totalPages);
        nextButton.addEventListener('click', () => displayRawLogs(page + 1));
        pagination.appendChild(nextButton);

        const endButton = document.createElement('button');
        endButton.textContent = 'End';
        endButton.addEventListener('click', () => {
            if (listId === 'raw-logs-list') {
                displayRawLogs(totalPages); // Go to the last page
            } else {
                displayActiveLogs(totalPages);
            }

        });
        pagination.appendChild(endButton);
        const logManagementSection = document.getElementById("log-management-section");
        logManagementSection.insertAdjacentElement('beforeend', pagination)
    }
  }
}

function addPageButton(pageNumber, currentPage, pagination) { // Helper function to create page buttons
    const pageButton = document.createElement('button');
    pageButton.textContent = pageNumber;

    if (pageNumber === currentPage) {
        pageButton.disabled = true; // Disable the current page button
    } else {
        pageButton.addEventListener('click', () => {

            if (pagination.id.includes("raw")) { //Check what list the pagination bar is controlling, and display accordingly
                displayRawLogs(pageNumber);
            } else {
                displayActiveLogs(pageNumber);
            }
        });
    }
    pagination.appendChild(pageButton);

}
    /**
     * Handle clicks on the visjs graph view.
     *
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     */
    function graphViewClickHandler(event, edgeDataSet, stixIdToObject)
    {
        if (event.nodes.length > 0)
        {
            // A click on a node
            let stixObject = stixIdToObject.get(event.nodes[0]);
            if (stixObject)
                populateSelected(stixObject, edgeDataSet, stixIdToObject);
        }
        else if (event.edges.length > 0)
        {
            // A click on an edge
            let stixRel = stixIdToObject.get(event.edges[0]);
            if (stixRel)
                populateSelected(stixRel, edgeDataSet, stixIdToObject);
            else
                // Just make something up to show for embedded relationships
                populateSelected(
                    new Map([["", "(Embedded relationship)"]]),
                    edgeDataSet, stixIdToObject
                );
        }
        // else, just a click on the canvas
    }


    /**
     * Handle clicks on the list view.
     *
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     */
    function listViewClickHandler(event, edgeDataSet, stixIdToObject)
    {
        let clickedItem = event.target;

        if (clickedItem.tagName === "LI")
        {
            let stixId = clickedItem.id;
            let stixObject = stixIdToObject.get(stixId);

            view.selectNode(stixId);

            if (stixObject)
                populateSelected(stixObject, edgeDataSet, stixIdToObject);
            else
                // Just make something up to show for embedded relationships
                populateSelected(
                    new Map([["", "(Embedded relationship)"]]),
                    edgeDataSet, stixIdToObject
                );
        }
    }


    /* ******************************************************
     * Initializes the view, then renders it.
     * ******************************************************/
    function vizStixWrapper(content, customConfig) {

        if (customConfig)
            try
            {
                customConfig = JSON.parse(customConfig);
            }
            catch(err)
            {
                alertException(err, "Invalid configuration: must be JSON");
                return;
            }
        else
            customConfig = {};

        // Hard-coded working icon directory setting for this application.
        customConfig.iconDir = "stix2viz/stix2viz/icons";

        toggleView();

        try
        {
            let [nodeDataSet, edgeDataSet, stixIdToObject]
                = stix2viz.makeGraphData(content, customConfig);

            let wantsList = false;
            if (nodeDataSet.length > 500)
                wantsList = confirm(
                    "This graph contains " + nodeDataSet.length.toString()
                    + " nodes.  Do you wish to display it as a list?"
                );

            if (wantsList)
            {
                view = stix2viz.makeListView(
                    canvas, nodeDataSet, edgeDataSet, stixIdToObject,
                    customConfig
                );

                view.on(
                    "click",
                    e => listViewClickHandler(e, edgeDataSet, stixIdToObject)
                );
            }
            else
            {
                view = stix2viz.makeGraphView(
                    canvas, nodeDataSet, edgeDataSet, stixIdToObject,
                    customConfig
                );

                view.on(
                    "click",
                    e => graphViewClickHandler(e, edgeDataSet, stixIdToObject)
                );
            }

            populateLegend(...view.legendData);
        }
        catch (err)
        {
            console.log(err);
            alertException(err);
        }
    }

    /* ----------------------------------------------------- *
     * ******************************************************
     * This group of functions is for handling file "upload."
     * They take an event as input and parse the file on the
     * front end.
     * ******************************************************/
    function handleFileSelect(evt) {
      handleFiles(evt.target.files);
    }
    function handleFileDrop(evt) {
      evt.stopPropagation();
      evt.preventDefault();

      handleFiles(evt.dataTransfer.files);
    }
    function handleDragOver(evt) {
      evt.stopPropagation();
      evt.preventDefault();
      evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
    }
    function handleFiles(files) {
      // files is a FileList of File objects (in our case, just one)

      for (var i = 0, f; f = files[i]; i++) {
        document.getElementById('chosen-files').innerText += f.name + " ";
        let customConfig = document.getElementById('paste-area-custom-config').value;
        var r = new FileReader();
        r.onload = function(e) {vizStixWrapper(e.target.result, customConfig);};
        r.readAsText(f);
      }
      linkifyHeader();
    }
    /* ---------------------------------------------------- */

    /* ******************************************************
     * Handles content pasted to the text area.
     * ******************************************************/
    function handleTextarea() {
      let customConfig = document.getElementById('paste-area-custom-config').value;
      let content = document.getElementById('paste-area-stix-json').value;
      vizStixWrapper(content, customConfig);
      linkifyHeader();
    }

    /* ******************************************************
     * Fetches STIX 2.0 data from an external URL (supplied
     * user) via AJAX. Server-side Access-Control-Allow-Origin
     * must allow cross-domain requests for this to work.
     * ******************************************************/
    function handleFetchJson() {
      var url = document.getElementById("url").value;
      let customConfig = document.getElementById('paste-area-custom-config').value;
      fetchJsonAjax(url, function(content) {
        vizStixWrapper(content, customConfig);
      });
      linkifyHeader();
    }

    /**
     * Toggle the display of graph nodes of a particular STIX type.
     */
    function legendClickHandler(event)
    {
        if (!view)
            return;

        let td;
        let clickedTagName = event.target.tagName.toLowerCase();

        if (clickedTagName === "td")
            // ... if the legend item text was clicked
            td = event.target;
        else if (clickedTagName === "img")
            // ... if the legend item icon was clicked
            td = event.target.parentElement;
        else
            return;

        // The STIX type the user clicked on
        let toggledStixType = td.textContent.trim().toLowerCase();

        view.toggleStixType(toggledStixType);

        // style change to remind users what they've hidden.
        td.classList.toggle("typeHidden");
    }

    /* ******************************************************
     * Adds icons and information to the legend.
     * ******************************************************/
    function populateLegend(iconURLMap, defaultIconURL) {
        let tbody, tr, td;
        let colIdx = 0;
        let table = document.getElementById('legend-content');

        // Reset table content if necessary.
        if (table.tBodies.length === 0)
            tbody = table.createTBody();
        else
            tbody = table.tBodies[0];

        tbody.replaceChildren();

        tr = tbody.insertRow();

        for (let [stixType, iconURL] of iconURLMap)
        {
            let img = document.createElement('img');

            img.onerror = function() {
                // set the node's icon to the default if this image could not
                // load
                this.src = defaultIconURL;
                // our default svg is enormous... shrink it down!
                this.width = "37";
                this.height = "37";
            }
            img.src = iconURL;

            if (colIdx > 1)
            {
                colIdx = 0;
                tr = tbody.insertRow();
            }

            td = tr.insertCell();
            ++colIdx;

            td.append(img);
            td.append(stixType.charAt(0).toUpperCase() + stixType.substr(1).toLowerCase());
        }
    }

    /**
     * A JSON.stringify() replacer function to enable it to handle Map objects
     * like plain javascript objects.
     */
    function mapReplacer(key, value)
    {
        if (value instanceof Map)
        {
            let plainObj = {};
            for (let [subKey, subValue] of value)
                plainObj[subKey] = subValue;

            value = plainObj;
        }

        return value;
    }

    /**
     * Create a rendering of an array as part of rendering an overall STIX
     * object.
     *
     * @param arrayContent The array to render
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     * @param isRefs Whether the array is the value of a _refs property, i.e.
     *      an array of STIX IDs.  Used to produce a distinctive rendering for
     *      references.
     * @return The rendering as an array of DOM elements
     */
    function stixArrayContentToDOMNodes(
        arrayContent, edgeDataSet, stixIdToObject, isRefs=false
    )
    {
        let nodes = [];

        let ol = document.createElement("ol");
        ol.className = "selected-object-list";

        for (let elt of arrayContent)
        {
            let contentNodes;
            if (isRefs)
                contentNodes = stixStringContentToDOMNodes(
                    elt, edgeDataSet, stixIdToObject, /*isRef=*/true
                );
            else
                contentNodes = stixContentToDOMNodes(
                    elt, edgeDataSet, stixIdToObject
                );

            let li = document.createElement("li");
            li.append(...contentNodes);
            ol.append(li);
        }

        nodes.push(document.createTextNode("["));
        nodes.push(ol);
        nodes.push(document.createTextNode("]"));

        return nodes;
    }

    /**
     * Create a rendering of an object/dictionary as part of rendering an
     * overall STIX object.
     *
     * @param objectContent The object/dictionary to render, as a Map instance
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     * @param topLevel Whether objectContent is itself a whole STIX object,
     *      i.e. the top level of a content tree.  This is used to adjust the
     *      rendering, e.g. omit the surrounding braces at the top level.
     * @return The rendering as an array of DOM elements
     */
    function stixObjectContentToDOMNodes(
        objectContent, edgeDataSet, stixIdToObject, topLevel=false
    )
    {
        let nodes = [];

        if (!topLevel)
            nodes.push(document.createTextNode("{"));

        for (let [propName, propValue] of objectContent)
        {
            let propNameSpan = document.createElement("span");
            propNameSpan.className = "selected-object-prop-name";
            propNameSpan.append(propName + ":");

            let contentNodes;
            if (propName.endsWith("_ref"))
                 contentNodes = stixStringContentToDOMNodes(
                    propValue, edgeDataSet, stixIdToObject, /*isRef=*/true
                 );
            else if (propName.endsWith("_refs"))
                contentNodes = stixArrayContentToDOMNodes(
                    propValue, edgeDataSet, stixIdToObject, /*isRefs=*/true
                );
            else
                contentNodes = stixContentToDOMNodes(
                    propValue, edgeDataSet, stixIdToObject
                );

            let propDiv = document.createElement("div");
            propDiv.append(propNameSpan);
            propDiv.append(...contentNodes);

            if (!topLevel)
                propDiv.className = "selected-object-object-content";

            nodes.push(propDiv);
        }

        if (!topLevel)
            nodes.push(document.createTextNode("}"));

        return nodes;
    }

    /**
     * Create a rendering of a string value as part of rendering an overall
     * STIX object.
     *
     * @param stringContent The string to render
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     * @param isRef Whether the string is the value of a _ref property.  Used
     *      to produce a distinctive rendering for references.
     * @return The rendering as an array of DOM elements
     */
    function stixStringContentToDOMNodes(
        stringContent, edgeDataSet, stixIdToObject, isRef=false
    )
    {
        let nodes = [];

        let spanWrapper = document.createElement("span");
        spanWrapper.append(stringContent);

        if (isRef)
        {
            let referentObj = stixIdToObject.get(stringContent);
            if (referentObj)
            {
                spanWrapper.className = "selected-object-text-value-ref";
                spanWrapper.addEventListener(
                    "click", e => {
                        e.stopPropagation();
                        view.selectNode(referentObj.get("id"));
                        populateSelected(
                            referentObj, edgeDataSet, stixIdToObject
                        );
                    }
                );
            }
            else
                spanWrapper.className = "selected-object-text-value-ref-dangling";
        }
        else
            spanWrapper.className = "selected-object-text-value";

        nodes.push(spanWrapper);

        return nodes;
    }

    /**
     * Create a rendering of a value for which no other special rendering
     * applies, as part of rendering an overall STIX object.
     *
     * @param otherContent The content to render
     * @return The rendering as an array of DOM elements
     */
    function stixOtherContentToDOMNodes(otherContent)
    {
        let nodes = [];

        let asText;
        if (otherContent === null)
            asText = "null";
        else if (otherContent === undefined)
            asText = "undefined";  // also just in case??
        else
            asText = otherContent.toString();

        let spanWrapper = document.createElement("span");
        spanWrapper.append(asText);
        spanWrapper.className = "selected-object-nontext-value";
        nodes.push(spanWrapper);

        return nodes;
    }

    /**
     * Create a rendering of a value, as part of rendering an overall STIX
     * object.  This function dispatches to one of the more specialized
     * rendering functions based on the type of the value.
     *
     * @param stixContent The content to render
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     * @return The rendering as an array of DOM elements
     */
    function stixContentToDOMNodes(stixContent, edgeDataSet, stixIdToObject)
    {
        let nodes;

        if (stixContent instanceof Map)
            nodes = stixObjectContentToDOMNodes(
                stixContent, edgeDataSet, stixIdToObject
            );
        else if (Array.isArray(stixContent))
            nodes = stixArrayContentToDOMNodes(
                stixContent, edgeDataSet, stixIdToObject
            );
        else if (
            typeof stixContent === "string" || stixContent instanceof String
        )
            nodes = stixStringContentToDOMNodes(
                stixContent, edgeDataSet, stixIdToObject
            );
        else
            nodes = stixOtherContentToDOMNodes(stixContent);

        return nodes;
    }

    /**
     * Populate the Linked Nodes box with the connections of the given STIX
     * object.
     *
     * @param stixObject The STIX object to display connection information
     *      about
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     */
    function populateConnections(stixObject, edgeDataSet, stixIdToObject)
    {
        let objId = stixObject.get("id");

        let edges = edgeDataSet.get({
            filter: item => (item.from === objId || item.to === objId)
        });

        let eltConnIncoming = document.getElementById("connections-incoming");
        let eltConnOutgoing = document.getElementById("connections-outgoing");

        eltConnIncoming.replaceChildren();
        eltConnOutgoing.replaceChildren();

        let listIn = document.createElement("ol");
        let listOut = document.createElement("ol");

        eltConnIncoming.append(listIn);
        eltConnOutgoing.append(listOut);

        for (let edge of edges)
        {
            let targetList;
            let summaryNode = document.createElement("summary");
            let otherEndSpan = document.createElement("span");
            let otherEndObj;

            if (objId === edge.from)
            {
                otherEndObj = stixIdToObject.get(edge.to);
                otherEndSpan.append(otherEndObj.get("type"));

                summaryNode.append(edge.label + " ");
                summaryNode.append(otherEndSpan);

                targetList = listOut;
            }
            else
            {
                otherEndObj = stixIdToObject.get(edge.from);
                otherEndSpan.append(otherEndObj.get("type"));

                summaryNode.append(otherEndSpan);
                summaryNode.append(" " + edge.label);

                targetList = listIn;
            }

            otherEndSpan.className = "selected-object-text-value-ref";
            otherEndSpan.addEventListener(
                "click", e => {
                    view.selectNode(otherEndObj.get("id"));
                    populateSelected(otherEndObj, edgeDataSet, stixIdToObject);
                }
            );

            let li = document.createElement("li");
            let detailsNode = document.createElement("details");

            targetList.append(li);
            li.append(detailsNode);
            detailsNode.append(summaryNode);

            let objRenderNodes = stixObjectContentToDOMNodes(
                otherEndObj, edgeDataSet, stixIdToObject, /*topLevel=*/true
            );
            detailsNode.append(...objRenderNodes);
        }
    }

    /**
     * Populate relevant webpage areas according to a particular STIX object.
     *
     * @param stixObject The STIX object to display information about
     * @param edgeDataSet A visjs DataSet instance with graph edge data derived
     *      from STIX content
     * @param stixIdToObject A Map instance mapping STIX IDs to STIX objects as
     *      Maps, containing STIX content.
     */
    function populateSelected(stixObject, edgeDataSet, stixIdToObject) {
        // Remove old values from HTML
        let selectedContainer = document.getElementById('selection');
        selectedContainer.replaceChildren();

        let contentNodes = stixObjectContentToDOMNodes(
            stixObject, edgeDataSet, stixIdToObject, /*topLevel=*/true
        );
        selectedContainer.append(...contentNodes);

        populateConnections(stixObject, edgeDataSet, stixIdToObject);
    }

    /* ******************************************************
     * Toggle the view between the data entry container and
     * the view container
     * ******************************************************/
    function toggleView() {
      uploader.classList.toggle("hidden");
      canvasContainer.classList.toggle("hidden");
    }

    /* ******************************************************
     * Turns header into a "home" "link"
     * ******************************************************/
    function linkifyHeader() {
      var header = document.getElementById('header');
      header.classList.add('linkish');
    }

     /* *****************************************************
      * Returns the page to its original load state
      * *****************************************************/
    function resetPage() {
      var header = document.getElementById('header');
      if (header.classList.contains('linkish')) {
        toggleView();
        if (view)
        {
            view.destroy();
            view = null;
        }
        document.getElementById('files').value = ""; // reset the files input
        document.getElementById('chosen-files').innerHTML = ""; // reset the subheader text
        document.getElementById('selection').innerHTML = ""; // reset the selected node in the sidebar

        // Reset legend table
        let table = document.getElementById('legend-content');
        if (table.tBodies.length > 0)
        {
            let tbody = table.tBodies[0];
            tbody.replaceChildren();
        }

        // reset connections box
        let eltConnIncoming = document.getElementById("connections-incoming");
        let eltConnOutgoing = document.getElementById("connections-outgoing");
        eltConnIncoming.replaceChildren();
        eltConnOutgoing.replaceChildren();

        header.classList.remove('linkish');
      }
    }

    /* ******************************************************
     * Generic AJAX 'GET' request.
     *
     * Takes a URL and a callback function as input.
     * ******************************************************/
    function fetchJsonAjax(url, cfunc) {
      var regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/i;
      if (!regex.test(url)) {
        alert("ERROR: Double check url provided");
      }

      var xhttp;
      if (window.XMLHttpRequest) {
        xhttp = new XMLHttpRequest();
      } else {
        xhttp = new ActiveXObject("Microsoft.XMLHTTP"); // For IE5 and IE6 luddites
      }
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4 && xhttp.status == 200) {
          cfunc(xhttp.responseText);
        } else if (xhttp.status != 200 && xhttp.status != 0) {
          alert("ERROR: " + xhttp.status + ": " + xhttp.statusText + " - Double check url provided");
          return;
        }

        xhttp.onerror = function() {
          alert("ERROR: Unable to fetch JSON. The domain entered has either rejected the request, \
is not serving JSON, or is not running a webserver.\n\nA GitHub Gist can be created to host RAW JSON data to prevent this.");
        };
      }
      xhttp.open("GET", url, true);
      xhttp.send();
    }

    /* ******************************************************
     * AJAX 'GET' request from `?url=` parameter
     *
     * Will check the URL during `window.onload` to determine
     * if `?url=` parameter is provided
     * ******************************************************/
    function fetchJsonFromUrl() {
      var url = window.location.href;

      // If `?` is not provided, load page normally
      if (/\?/.test(url)) {
        // Regex to see if `url` parameter has a valid url value
        var regex = /\?url=https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/i;
        var res = regex.exec(url);
        if (res != null) {
          // Get the value from the `url` parameter
          let req_url = res[0].substring(5);

          // Fetch JSON from the url
          fetchJsonAjax(req_url, function(content) {
            vizStixWrapper(content)
          });
          linkifyHeader();

        } else {
          alert("ERROR: Invalid url - Request must start with '?url=http[s]://' and be a valid domain");
        }
      }
    }

    function selectedNodeClick() {
      let selected = document.getElementById('selected');
      if (selected.className.indexOf('clicked') === -1) {
        selected.className += " clicked";
        selected.style.position = 'absolute';
        selected.style.left = '25px';
        selected.style.width = (window.innerWidth - 110) + "px";
        selected.style.top = (document.getElementById('canvas').offsetHeight + 25) + "px";
        selected.scrollIntoView(true);
      } else {
        selected.className = "sidebar"
        selected.removeAttribute("style")
      }
    }

    /* ******************************************************
     * When the page is ready, setup the visualization and bind events
     * ******************************************************/
    document.getElementById('files').addEventListener('change', handleFileSelect, false);
    document.getElementById('paste-parser').addEventListener('click', handleTextarea, false);
    document.getElementById('fetch-url').addEventListener('click', handleFetchJson, false);
    document.getElementById('header').addEventListener('click', resetPage, false);
    uploader.addEventListener('dragover', handleDragOver, false);
    uploader.addEventListener('drop', handleFileDrop, false);
    document.getElementById('selected').addEventListener('click', selectedNodeClick, false);
    document.getElementById("legend").addEventListener("click", legendClickHandler, {capture: true});

    fetchJsonFromUrl();
});
