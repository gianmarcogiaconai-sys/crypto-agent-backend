// Indicatori Tecnici
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    let diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += -diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  let rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  let multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateMACD(prices) {
  if (prices.length < 26) return null;
  let ema12 = calculateEMA(prices, 12);
  let ema26 = calculateEMA(prices, 26);
  let macd = ema12 - ema26;
  return { macd, signal: macd };
}

function calculateBollinger(prices, period = 20) {
  if (prices.length < period) return null;
  let lastPrices = prices.slice(-period);
  let sma = lastPrices.reduce((a, b) => a + b) / period;
  let variance = lastPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  let stdDev = Math.sqrt(variance);
  return {
    upper: sma + 2 * stdDev,
    middle: sma,
    lower: sma - 2 * stdDev
  };
}

// Fetch Kucoin
async function getKuCoinCandles(symbol, timeframe) {
  let type = timeframe;
  let url = `https://api.kucoin.com/api/v1/market/candles?symbol=${symbol}&type=${type}`;
  let res = await fetch(url);
  let json = await res.json();
  if (!json.data) throw new Error('No data from Kucoin');
  return json.data.map(c => ({
    time: parseInt(c[0]),
    open: parseFloat(c[1]),
    close: parseFloat(c[2]),
    high: parseFloat(c[3]),
    low: parseFloat(c[4]),
    volume: parseFloat(c[5])
  }));
}

// Analisi
async function analyzeMarket(symbol, timeframe) {
  let candles = await getKuCoinCandles(symbol, timeframe);
  let closes = candles.map(c => c.close);
  
  let currentPrice = closes[closes.length - 1];
  let rsi = calculateRSI(closes);
  let ema20 = calculateEMA(closes, 20);
  let ema50 = calculateEMA(closes, 50);
  let macd = calculateMACD(closes);
  let bb = calculateBollinger(closes);
  
  let signal = 'NEUTRAL';
  let strength = 0;
  
  if (rsi < 30) strength += 2;
  if (rsi > 70) strength -= 2;
  if (macd.signal > 0) strength += 1;
  if (ema20 > ema50) strength += 1;
  
  if (strength >= 2) signal = 'BUY';
  else if (strength <= -2) signal = 'SELL';
  
  return {
    symbol,
    timeframe,
    timestamp: new Date().toISOString(),
    price: currentPrice,
    rsi: Math.round(rsi * 100) / 100,
    macd: {
      value: Math.round(macd.macd * 10000) / 10000,
      signal: macd.signal > 0 ? 'BULLISH' : 'BEARISH'
    },
    ema: { ema20, ema50 },
    bollinger: bb,
    signal,
    strength,
    candles: candles.slice(-10)
  };
}

// Handler Vercel
export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    const { symbol = 'SOL-USDT', timeframe = '15min' } = req.query;
    const result = await analyzeMarket(symbol, timeframe);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
