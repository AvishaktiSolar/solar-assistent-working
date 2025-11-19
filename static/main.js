// main.js - Global Variables & App Initialization

// --- Global State Variables ---
let siteData = {
  site_name: '',
  latitude: 0,
  longitude: 0
};

let bills = [];
let billCounter = 0;
let fetchedSolarData = null; 
let finalReportData = {}; // Holds all data for PDF/Excel export
let markerSource;
let map; // OpenLayers map object

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', function() {
  // Call functions from our other JS files
  addNewBill(); // From bill.js
  initializeMap(); // From map.js
});