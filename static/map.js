// map.js - All OpenLayers Map Logic

// Function to initialize the OpenLayers Map
function initializeMap() {
    markerSource = new ol.source.Vector();

    const markerStyle = new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 46],
            anchorXUnits: 'fraction',
            anchorYUnits: 'pixels',
            src: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
        })
    });

    const markerLayer = new ol.layer.Vector({
        source: markerSource,
        style: markerStyle
    });

    const osmLayer = new ol.layer.Tile({
        source: new ol.source.OSM()
    });

    map = new ol.Map({
        target: 'map',
        layers: [osmLayer, markerLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([78.9629, 22.5937]),
            zoom: 5
        })
    });

    map.on('singleclick', function (evt) {
        const mapCoordinates = evt.coordinate;

        const lonLat = ol.proj.toLonLat(mapCoordinates);
        const lon = lonLat[0];
        const lat = lonLat[1];

        // Update the input fields
        document.getElementById('latitude').value = lat.toFixed(6);
        document.getElementById('longitude').value = lon.toFixed(6);

        // Clear previous marker
        markerSource.clear();

        // Create a new marker feature
        const marker = new ol.Feature({
            geometry: new ol.geom.Point(mapCoordinates)
        });

        // Add marker to the source
        markerSource.addFeature(marker);
    });
}

// Function to sync the input fields *to* the map
function syncMapToInputs() {
    const lat = parseFloat(document.getElementById('latitude').value);
    const lon = parseFloat(document.getElementById('longitude').value);

    if (!isNaN(lat) && !isNaN(lon)) {
        // Call helper function to update pin and pan map
        updateMapMarker(lon, lat);
    }
}

// Helper function to add a marker and pan the map
function updateMapMarker(lon, lat) {
    if (!map || !markerSource) return;

    // Convert Lon/Lat (EPSG:4326) to map projection (EPSG:3857)
    const mapCoordinates = ol.proj.fromLonLat([lon, lat]);

    // Clear previous marker
    markerSource.clear();

    // Create a new marker
    const marker = new ol.Feature({
        geometry: new ol.geom.Point(mapCoordinates)
    });
    markerSource.addFeature(marker);

    // Animate map to the new location
    map.getView().animate({
        center: mapCoordinates,
        zoom: 10, // Zoom in a bit
        duration: 1000 // 1 second animation
    });
}