# official-krw

MCP server for Korea Eximbank (한국수출입은행) official exchange rates.

## Setup

1. Get a free API key from [Korea Eximbank Open API](https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2&viewtype=C#tab1)

2. Add to your MCP config (e.g. `~/.claude/claude_desktop_config.json` or Claude Code settings):

```json
{
  "mcpServers": {
    "official-krw": {
      "command": "npx",
      "args": ["-y", "official-krw"],
      "env": {
        "KOREAEXIM_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

## Tool: `get_exchange_rates`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search_date` | string | today | Date in `yyyy-MM-dd` format |
| `query` | string | USD filter | JSONata expression to filter the raw response |

**Default filter** (when `query` is omitted): returns only USD with `cur_unit`, `cur_nm`, `kftc_deal_bas_r`, and `deal_bas_r`.

### Response fields

| Field | Description |
|-------|-------------|
| `cur_unit` | Currency code (e.g. USD, EUR, JPY(100)) |
| `cur_nm` | Currency name in Korean |
| `deal_bas_r` | Standard exchange rate (매매 기준율) |
| `kftc_deal_bas_r` | KFTC standard rate (서울외국환중개 매매기준율) |
| `ttb` | Telegraphic Transfer Buying rate (송금 받을 때) |
| `tts` | Telegraphic Transfer Selling rate (송금 보낼 때) |
| `bkpr` | Book price (장부가격) |
| `kftc_bkpr` | KFTC book price |

### JSONata query examples

```
# All currencies
$

# All USD fields
$[cur_unit='USD']

# EUR rate
$[cur_unit='EUR'].deal_bas_r

# JPY rate
$[cur_unit='JPY(100)'].kftc_deal_bas_r

# Multiple currencies, specific fields
$[cur_unit in ['USD','EUR']].{"cur_unit": cur_unit, "deal_bas_r": deal_bas_r}
```
