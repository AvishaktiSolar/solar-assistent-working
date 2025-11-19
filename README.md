# Avishakti Solar Design Assistant ☀️

A web tool designed to provide instant, detailed solar system
calculations. This application fetches real-world solar irradiance data
from the NREL API based on your exact location and combines it with your
electricity bill data to generate a complete system size, financial
analysis, and exportable reports.

## ✨ Key Features

-   **Accurate Sizing:** Calculates the precise solar system size (kW)
    needed to cover 100% of your annual electricity load.
-   **Location-Specific Data:** Fetches real-world solar irradiance
    (GHI) and temperature data from the **NREL API** using your site's
    coordinates and panel tilt angle.
-   **Interactive Map:** Uses OpenLayers to let you click on a map to
    drop a pin and automatically get coordinates.
-   **Full Financial Analysis:** Instantly calculates key metrics like
    **Payback Period**, **ROI**, **CAPEX**, and **25-Year Savings**.
-   **Smart Bill Entry:** Automatically fills the 12-month consumption
    table when you enter your "Current Bill Month" and "Current Units."
-   **Multi-Report Export:** Generates professional, multi-page reports
    in both **PDF** and **Excel (.xlsx)** formats.

## 🚀 How to Run

### 1. Project Structure

    Solar_App_Project/
    ├── app.py
    ├── requirements.txt
    ├── Procfile
    ├── users.json
    ├── routes/
    │   ├── __init__.py
    │   ├── api.py
    │   └── auth.py
    ├── static/
    │   ├── index.css
    │   ├── main.js
    │   ├── calc.js
    │   ├── bill.js
    │   ├── export.js
    │   ├── map.js
    │   └── login.css
    └── templates/
        ├── index.html
        ├── login.html
        └── register.html

### 2. Backend Setup (Python)

#### Create a Virtual Environment (Recommended)

``` bash
python -m venv venv
source venv/bin/activate
# or
.env\Scriptsctivate
```

#### Install Dependencies

``` bash
pip install -r requirements.txt
```

#### Get NREL API Key

Replace inside `routes/api.py`:

``` python
API_KEY = "YOUR_API_KEY_HERE"
```

### 3. Run the Server

``` bash
python app.py
```

To allow external access:

``` bash
python app.py --host=0.0.0.0
```

### 4. Access the Application

Visit:

    http://127.0.0.1:5000
### 5. Access the Application

 Login Credentials

You can use the master credentials to bypass email verification:

### Username: avishaktiSolar

### Password: avishaktiSolar2025
 

------------------------------------------------------------------------

## ⚙️ Calculation Engine Overview

### Step 1: Inputs

-   **Annual units** from bill table.
-   **Average Tariff**:

```{=html}
<!-- -->
```
    avgTariff = totalCurrentBillAmount / totalCurrentUnits

-   **NREL Data** includes:
    -   Monthly GHI
    -   Monthly Temperature

### Step 2: System Sizing

    annualGenPerKW = avgIrradiance * 365 * PR
    requiredKW = totalAnnualUnits / annualGenPerKW
    panelsNeeded = ceil((requiredKW * 1000) / 580)
    actualKW = (panelsNeeded * 580) / 1000
    annualGen = actualKW * annualGenPerKW

### Step 3: Financial Calculations

    capex = actualKW * capexPerKW
    annualSavings = annualGen * avgTariff
    payback = capex / annualSavings
    roi = (annualSavings / capex) * 100
    savings25Year = annualSavings * 25

------------------------------------------------------------------------

## 📄 License

MIT License

------------------------------------------------------------------------

## 🧩 Maintained by

**Avishakti Energy Solutions**
