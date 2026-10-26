/**
 * Instrument catalogue. `ticker` is the T212-style short code; `symbol` is the
 * market-data provider symbol (Yahoo format; Polygon strips the suffix and only
 * supports US listings). Drift/vol drive the demo price model only.
 */
export interface InstrumentDef {
  ticker: string;
  name: string;
  exchange: "NASDAQ" | "NYSE" | "LSE" | "XETRA" | "EURONEXT";
  currency: "USD" | "GBP" | "GBX" | "EUR";
  sector: string;
  symbol: string;
  domain?: string;
  color: string;
  drift: number; // annualised
  vol: number; // annualised
}

type Row = [string, string, InstrumentDef["exchange"], string, string | undefined, string, number, number];

// ticker, name, exchange, sector, domain, color, drift, vol
const rows: Row[] = [
  ["AAPL", "Apple", "NASDAQ", "Technology", "apple.com", "#A2AAAD", 0.16, 0.26],
  ["MSFT", "Microsoft", "NASDAQ", "Technology", "microsoft.com", "#00A4EF", 0.18, 0.24],
  ["NVDA", "NVIDIA", "NASDAQ", "Semiconductors", "nvidia.com", "#76B900", 0.45, 0.5],
  ["AMZN", "Amazon", "NASDAQ", "Consumer", "amazon.com", "#FF9900", 0.17, 0.32],
  ["GOOGL", "Alphabet", "NASDAQ", "Technology", "abc.xyz", "#4285F4", 0.17, 0.28],
  ["META", "Meta Platforms", "NASDAQ", "Technology", "meta.com", "#0866FF", 0.25, 0.38],
  ["TSLA", "Tesla", "NASDAQ", "Automotive", "tesla.com", "#E82127", 0.12, 0.6],
  ["AVGO", "Broadcom", "NASDAQ", "Semiconductors", "broadcom.com", "#CC092F", 0.32, 0.38],
  ["AMD", "Advanced Micro Devices", "NASDAQ", "Semiconductors", "amd.com", "#ED1C24", 0.2, 0.5],
  ["ASML", "ASML Holding", "NASDAQ", "Semiconductors", "asml.com", "#10069F", 0.14, 0.36],
  ["TSM", "Taiwan Semiconductor", "NYSE", "Semiconductors", "tsmc.com", "#C4161C", 0.26, 0.34],
  ["SMCI", "Super Micro Computer", "NASDAQ", "Semiconductors", "supermicro.com", "#2E7D32", 0.3, 0.85],
  ["ARM", "Arm Holdings", "NASDAQ", "Semiconductors", "arm.com", "#0091BD", 0.28, 0.6],
  ["MU", "Micron Technology", "NASDAQ", "Semiconductors", "micron.com", "#0071C5", 0.15, 0.45],
  ["INTC", "Intel", "NASDAQ", "Semiconductors", "intel.com", "#0071C5", -0.08, 0.42],
  ["QCOM", "Qualcomm", "NASDAQ", "Semiconductors", "qualcomm.com", "#3253DC", 0.08, 0.34],
  ["PLTR", "Palantir", "NASDAQ", "Software", "palantir.com", "#101113", 0.6, 0.65],
  ["CRM", "Salesforce", "NYSE", "Software", "salesforce.com", "#00A1E0", 0.1, 0.32],
  ["ORCL", "Oracle", "NYSE", "Software", "oracle.com", "#C74634", 0.22, 0.3],
  ["ADBE", "Adobe", "NASDAQ", "Software", "adobe.com", "#FA0F00", 0.02, 0.32],
  ["NOW", "ServiceNow", "NYSE", "Software", "servicenow.com", "#62D84E", 0.18, 0.34],
  ["SNOW", "Snowflake", "NYSE", "Software", "snowflake.com", "#29B5E8", 0.04, 0.55],
  ["CRWD", "CrowdStrike", "NASDAQ", "Cybersecurity", "crowdstrike.com", "#FC0000", 0.26, 0.5],
  ["PANW", "Palo Alto Networks", "NASDAQ", "Cybersecurity", "paloaltonetworks.com", "#FA582D", 0.2, 0.36],
  ["NET", "Cloudflare", "NYSE", "Cybersecurity", "cloudflare.com", "#F38020", 0.22, 0.6],
  ["ZS", "Zscaler", "NASDAQ", "Cybersecurity", "zscaler.com", "#236BF5", 0.1, 0.5],
  ["SHOP", "Shopify", "NYSE", "Software", "shopify.com", "#95BF47", 0.2, 0.58],
  ["UBER", "Uber", "NYSE", "Consumer", "uber.com", "#000000", 0.2, 0.42],
  ["ABNB", "Airbnb", "NASDAQ", "Consumer", "airbnb.com", "#FF5A5F", 0.05, 0.42],
  ["NFLX", "Netflix", "NASDAQ", "Media", "netflix.com", "#E50914", 0.3, 0.38],
  ["SPOT", "Spotify", "NYSE", "Media", "spotify.com", "#1DB954", 0.35, 0.45],
  ["DIS", "Walt Disney", "NYSE", "Media", "disney.com", "#113CCF", 0.02, 0.3],
  ["COIN", "Coinbase", "NASDAQ", "Crypto", "coinbase.com", "#0052FF", 0.3, 0.85],
  ["MSTR", "MicroStrategy", "NASDAQ", "Crypto", "microstrategy.com", "#D9232E", 0.5, 1.0],
  ["MARA", "MARA Holdings", "NASDAQ", "Crypto", "mara.com", "#111111", 0.1, 1.0],
  ["HOOD", "Robinhood", "NASDAQ", "Fintech", "robinhood.com", "#00C805", 0.55, 0.75],
  ["PYPL", "PayPal", "NASDAQ", "Fintech", "paypal.com", "#003087", -0.02, 0.36],
  ["XYZ", "Block", "NYSE", "Fintech", "block.xyz", "#3E4348", 0.0, 0.55],
  ["SOFI", "SoFi Technologies", "NASDAQ", "Fintech", "sofi.com", "#00A9CE", 0.25, 0.65],
  ["V", "Visa", "NYSE", "Financials", "visa.com", "#1A1F71", 0.13, 0.2],
  ["MA", "Mastercard", "NYSE", "Financials", "mastercard.com", "#EB001B", 0.14, 0.22],
  ["JPM", "JPMorgan Chase", "NYSE", "Financials", "jpmorganchase.com", "#5D4B3C", 0.17, 0.24],
  ["GS", "Goldman Sachs", "NYSE", "Financials", "goldmansachs.com", "#7399C6", 0.18, 0.28],
  ["BRK.B", "Berkshire Hathaway B", "NYSE", "Financials", "berkshirehathaway.com", "#3E2C79", 0.12, 0.17],
  ["BLK", "BlackRock", "NYSE", "Financials", "blackrock.com", "#000000", 0.13, 0.25],
  ["LLY", "Eli Lilly", "NYSE", "Healthcare", "lilly.com", "#D52B1E", 0.3, 0.3],
  ["NVO", "Novo Nordisk", "NYSE", "Healthcare", "novonordisk.com", "#001965", 0.05, 0.36],
  ["UNH", "UnitedHealth", "NYSE", "Healthcare", "unitedhealthgroup.com", "#002677", -0.05, 0.3],
  ["JNJ", "Johnson & Johnson", "NYSE", "Healthcare", "jnj.com", "#D51900", 0.04, 0.16],
  ["ISRG", "Intuitive Surgical", "NASDAQ", "Healthcare", "intuitive.com", "#0C6FB8", 0.2, 0.3],
  ["ABBV", "AbbVie", "NYSE", "Healthcare", "abbvie.com", "#071D49", 0.12, 0.22],
  ["PFE", "Pfizer", "NYSE", "Healthcare", "pfizer.com", "#0093D0", -0.06, 0.24],
  ["KO", "Coca-Cola", "NYSE", "Consumer Staples", "coca-cola.com", "#F40009", 0.06, 0.15],
  ["PEP", "PepsiCo", "NASDAQ", "Consumer Staples", "pepsico.com", "#004B93", 0.02, 0.16],
  ["PG", "Procter & Gamble", "NYSE", "Consumer Staples", "pg.com", "#003DA5", 0.06, 0.15],
  ["COST", "Costco", "NASDAQ", "Consumer Staples", "costco.com", "#E31837", 0.2, 0.2],
  ["WMT", "Walmart", "NYSE", "Consumer Staples", "walmart.com", "#0071CE", 0.25, 0.2],
  ["MCD", "McDonald's", "NYSE", "Consumer", "mcdonalds.com", "#FFC72C", 0.07, 0.18],
  ["NKE", "Nike", "NYSE", "Consumer", "nike.com", "#111111", -0.1, 0.3],
  ["SBUX", "Starbucks", "NASDAQ", "Consumer", "starbucks.com", "#00704A", 0.02, 0.28],
  ["HD", "Home Depot", "NYSE", "Consumer", "homedepot.com", "#F96302", 0.08, 0.22],
  ["XOM", "Exxon Mobil", "NYSE", "Energy", "exxonmobil.com", "#ED1B2F", 0.06, 0.24],
  ["CVX", "Chevron", "NYSE", "Energy", "chevron.com", "#0054A4", 0.04, 0.24],
  ["NEE", "NextEra Energy", "NYSE", "Utilities", "nexteraenergy.com", "#00A3E0", 0.06, 0.24],
  ["ENPH", "Enphase Energy", "NASDAQ", "Clean Energy", "enphase.com", "#F37321", -0.2, 0.65],
  ["FSLR", "First Solar", "NASDAQ", "Clean Energy", "firstsolar.com", "#D71920", 0.08, 0.5],
  ["CEG", "Constellation Energy", "NASDAQ", "Utilities", "constellationenergy.com", "#0F4C81", 0.4, 0.42],
  ["VST", "Vistra", "NYSE", "Utilities", "vistracorp.com", "#00857C", 0.5, 0.48],
  ["CCJ", "Cameco", "NYSE", "Energy", "cameco.com", "#00843D", 0.22, 0.45],
  ["O", "Realty Income", "NYSE", "Real Estate", "realtyincome.com", "#1E3A5F", 0.03, 0.2],
  ["PLD", "Prologis", "NYSE", "Real Estate", "prologis.com", "#00A3AD", 0.04, 0.26],
  ["CAT", "Caterpillar", "NYSE", "Industrials", "caterpillar.com", "#FFCD11", 0.15, 0.28],
  ["GE", "GE Aerospace", "NYSE", "Industrials", "geaerospace.com", "#005EB8", 0.35, 0.3],
  ["LMT", "Lockheed Martin", "NYSE", "Defence", "lockheedmartin.com", "#003A70", 0.08, 0.2],
  ["RTX", "RTX", "NYSE", "Defence", "rtx.com", "#CE1126", 0.15, 0.22],
  ["RKLB", "Rocket Lab", "NASDAQ", "Space", "rocketlabusa.com", "#111111", 0.6, 0.9],
  ["ASTS", "AST SpaceMobile", "NASDAQ", "Space", "ast-science.com", "#0A2240", 0.5, 1.1],
  ["IONQ", "IonQ", "NYSE", "Quantum", "ionq.com", "#6B48FF", 0.5, 1.0],
  ["RGTI", "Rigetti Computing", "NASDAQ", "Quantum", "rigetti.com", "#2E9AD0", 0.6, 1.2],
  ["VUSA", "Vanguard S&P 500 UCITS ETF", "LSE", "ETF", "vanguard.co.uk", "#96151D", 0.13, 0.17],
  ["VWRL", "Vanguard FTSE All-World UCITS ETF", "LSE", "ETF", "vanguard.co.uk", "#96151D", 0.1, 0.15],
  ["VUAG", "Vanguard S&P 500 (Acc) UCITS ETF", "LSE", "ETF", "vanguard.co.uk", "#96151D", 0.13, 0.17],
  ["VWRP", "Vanguard FTSE All-World (Acc)", "LSE", "ETF", "vanguard.co.uk", "#96151D", 0.1, 0.15],
  ["EQQQ", "Invesco EQQQ Nasdaq-100 UCITS ETF", "LSE", "ETF", "invesco.com", "#0B2D71", 0.17, 0.22],
  ["CNX1", "iShares Nasdaq 100 UCITS ETF", "LSE", "ETF", "ishares.com", "#000000", 0.17, 0.22],
  ["CSP1", "iShares Core S&P 500 UCITS ETF", "LSE", "ETF", "ishares.com", "#000000", 0.13, 0.17],
  ["SWDA", "iShares Core MSCI World UCITS ETF", "LSE", "ETF", "ishares.com", "#000000", 0.11, 0.15],
  ["EIMI", "iShares Core MSCI EM IMI UCITS ETF", "LSE", "ETF", "ishares.com", "#000000", 0.05, 0.17],
  ["SGLN", "iShares Physical Gold", "LSE", "Commodities", "ishares.com", "#C9A227", 0.15, 0.15],
  ["SMH", "VanEck Semiconductor UCITS ETF", "LSE", "ETF", "vaneck.com", "#005CA9", 0.3, 0.32],
  ["VHYL", "Vanguard FTSE All-World High Dividend", "LSE", "ETF", "vanguard.co.uk", "#96151D", 0.07, 0.13],
  ["IUIT", "iShares S&P 500 IT Sector", "LSE", "ETF", "ishares.com", "#000000", 0.22, 0.24],
  ["INRG", "iShares Global Clean Energy", "LSE", "ETF", "ishares.com", "#000000", -0.08, 0.3],
  ["DFNS", "VanEck Defense UCITS ETF", "LSE", "ETF", "vaneck.com", "#005CA9", 0.3, 0.22],
  ["URNU", "Global X Uranium UCITS ETF", "LSE", "ETF", "globalxetfs.com", "#00263E", 0.15, 0.4],
  ["AZN", "AstraZeneca", "LSE", "Healthcare", "astrazeneca.com", "#830051", 0.08, 0.22],
  ["SHEL", "Shell", "LSE", "Energy", "shell.com", "#FBCE07", 0.06, 0.24],
  ["HSBA", "HSBC", "LSE", "Financials", "hsbc.com", "#DB0011", 0.18, 0.24],
  ["ULVR", "Unilever", "LSE", "Consumer Staples", "unilever.com", "#1F36C7", 0.06, 0.16],
  ["RR", "Rolls-Royce", "LSE", "Industrials", "rolls-royce.com", "#10069F", 0.55, 0.38],
  ["BARC", "Barclays", "LSE", "Financials", "barclays.com", "#00AEEF", 0.3, 0.32],
  ["LLOY", "Lloyds Banking Group", "LSE", "Financials", "lloydsbankinggroup.com", "#006A4D", 0.2, 0.28],
  ["BP.", "BP", "LSE", "Energy", "bp.com", "#009900", -0.02, 0.26],
  ["GSK", "GSK", "LSE", "Healthcare", "gsk.com", "#F36633", 0.0, 0.2],
  ["BA.", "BAE Systems", "LSE", "Defence", "baesystems.com", "#ED1C24", 0.25, 0.24],
  ["LSEG", "London Stock Exchange Group", "LSE", "Financials", "lseg.com", "#001EFF", 0.1, 0.2],
  ["DGE", "Diageo", "LSE", "Consumer Staples", "diageo.com", "#000000", -0.1, 0.22],
  ["TSCO", "Tesco", "LSE", "Consumer Staples", "tesco.com", "#00539F", 0.15, 0.2],
  ["SAP", "SAP", "XETRA", "Software", "sap.com", "#0FAAFF", 0.28, 0.26],
  ["SIE", "Siemens", "XETRA", "Industrials", "siemens.com", "#009999", 0.15, 0.24],
  ["RHM", "Rheinmetall", "XETRA", "Defence", "rheinmetall.com", "#003D7C", 0.7, 0.45],
  ["ALV", "Allianz", "XETRA", "Financials", "allianz.com", "#003781", 0.14, 0.2],
  ["MC", "LVMH", "EURONEXT", "Luxury", "lvmh.com", "#000000", -0.04, 0.28],
  ["RMS", "Hermès", "EURONEXT", "Luxury", "hermes.com", "#F37021", 0.12, 0.26],
  ["AIR", "Airbus", "EURONEXT", "Industrials", "airbus.com", "#00205B", 0.15, 0.26],
  ["SU", "Schneider Electric", "EURONEXT", "Industrials", "se.com", "#3DCD58", 0.18, 0.26],
];

const SUFFIX: Record<InstrumentDef["exchange"], string> = {
  NASDAQ: "",
  NYSE: "",
  LSE: ".L",
  XETRA: ".DE",
  EURONEXT: ".PA",
};

const CURRENCY: Record<InstrumentDef["exchange"], InstrumentDef["currency"]> = {
  NASDAQ: "USD",
  NYSE: "USD",
  LSE: "GBX",
  XETRA: "EUR",
  EURONEXT: "EUR",
};

export const INSTRUMENTS: InstrumentDef[] = rows.map(([ticker, name, exchange, sector, domain, color, drift, vol]) => ({
  ticker,
  name,
  exchange,
  currency: CURRENCY[exchange],
  sector,
  symbol: ticker.replace(/\.$/, "").replace(".B", "-B") + SUFFIX[exchange],
  domain,
  color,
  drift,
  vol,
}));

export const INSTRUMENT_BY_TICKER = new Map(INSTRUMENTS.map((i) => [i.ticker, i]));

/** Thematic baskets used by the demo source to build realistic pies. */
export const THEMES: Record<string, { category: string; tickers: string[]; names: string[] }> = {
  ai: {
    category: "Technology",
    tickers: ["NVDA", "MSFT", "GOOGL", "META", "AVGO", "AMD", "TSM", "ASML", "PLTR", "ARM", "SMCI", "MU", "ORCL", "SMH", "SNOW", "NOW"],
    names: ["AI Revolution", "Machine Minds", "Silicon Brains", "Neural Net Worth", "AI Picks & Shovels", "The Compute Trade", "GPU Gold Rush", "Agentic Era"],
  },
  semis: {
    category: "Technology",
    tickers: ["NVDA", "AVGO", "AMD", "TSM", "ASML", "MU", "QCOM", "INTC", "ARM", "SMH"],
    names: ["Chip Stack", "Semiconductor Supercycle", "Wafer Thin Margins", "Foundry Fund", "Silicon Valley Core"],
  },
  bigtech: {
    category: "Technology",
    tickers: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "NFLX", "AVGO"],
    names: ["Magnificent Seven", "Big Tech Bundle", "FAANG+", "Mega Cap Growth", "The Usual Suspects", "Tech Titans"],
  },
  dividend: {
    category: "Dividends",
    tickers: ["KO", "PEP", "PG", "JNJ", "O", "ABBV", "XOM", "CVX", "MCD", "HD", "VHYL", "ULVR", "SHEL", "HSBA", "LLOY", "PLD"],
    names: ["Dividend Snowball", "Passive Income Machine", "Monthly Paycheque", "Sleep Well Dividends", "Income Aristocrats", "Yield Harvest"],
  },
  index: {
    category: "Index & ETF",
    tickers: ["VUSA", "VWRL", "VUAG", "VWRP", "EQQQ", "CNX1", "CSP1", "SWDA", "EIMI", "SGLN", "VHYL", "IUIT"],
    names: ["Boring But Rich", "Global Core", "Three Fund Portfolio", "Set & Forget", "ETF Lazy Pie", "World Domination", "Bogle Mode"],
  },
  uk: {
    category: "UK",
    tickers: ["AZN", "SHEL", "HSBA", "ULVR", "RR", "BARC", "LLOY", "BP.", "GSK", "BA.", "LSEG", "DGE", "TSCO", "VUSA"],
    names: ["FTSE Favourites", "Best of British", "London Calling", "UK Value Hunt", "Rule Britannia"],
  },
  defence: {
    category: "Defence",
    tickers: ["LMT", "RTX", "RHM", "BA.", "GE", "DFNS", "AIR", "PLTR"],
    names: ["Defence Spending Boom", "Shield & Sword", "Aerospace & Defence", "Rearmament Trade"],
  },
  energy: {
    category: "Energy",
    tickers: ["CEG", "VST", "CCJ", "NEE", "FSLR", "ENPH", "URNU", "XOM", "CVX", "INRG", "SU"],
    names: ["Power the Datacentres", "Nuclear Renaissance", "Energy Transition", "Grid Builders", "Uranium Fever"],
  },
  fintech: {
    category: "Fintech",
    tickers: ["V", "MA", "PYPL", "XYZ", "SOFI", "HOOD", "COIN", "JPM", "GS", "BLK"],
    names: ["Future of Money", "Fintech Disruptors", "Payments Rails", "Neo-Banking"],
  },
  crypto: {
    category: "Crypto",
    tickers: ["COIN", "MSTR", "MARA", "HOOD", "XYZ", "NVDA"],
    names: ["Crypto Proxy", "Bitcoin Without Bitcoin", "Satoshi's Stocks", "HODL Pie"],
  },
  health: {
    category: "Healthcare",
    tickers: ["LLY", "NVO", "UNH", "JNJ", "ISRG", "ABBV", "PFE", "AZN", "GSK"],
    names: ["GLP-1 Gold Rush", "Healthcare Compounders", "Longevity Pie", "Pharma Moat"],
  },
  space: {
    category: "Moonshots",
    tickers: ["RKLB", "ASTS", "IONQ", "RGTI", "PLTR", "TSLA", "SMCI", "HOOD", "MSTR"],
    names: ["Moonshot Mania", "Space & Quantum", "High Risk High Reward", "Ten Bagger Hunt", "YOLO Pie"],
  },
  quality: {
    category: "Quality",
    tickers: ["MSFT", "V", "MA", "COST", "ASML", "LLY", "BRK.B", "RMS", "MC", "SAP", "ISRG", "SPOT"],
    names: ["Quality Compounders", "Moat Hunters", "Buffett Would Approve", "Wide Moat Core", "Forever Stocks"],
  },
  cyber: {
    category: "Technology",
    tickers: ["CRWD", "PANW", "NET", "ZS", "MSFT", "PLTR"],
    names: ["Cyber Shield", "Zero Trust Pie", "Security First"],
  },
  consumer: {
    category: "Consumer",
    tickers: ["AMZN", "COST", "WMT", "MCD", "NKE", "SBUX", "ABNB", "UBER", "NFLX", "SPOT", "DIS", "SHOP"],
    names: ["Everyday Brands", "Consumer Kings", "Spend With Me", "Subscription Economy"],
  },
};
