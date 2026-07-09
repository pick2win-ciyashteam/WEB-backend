# Teams Generation Admin Reports API Documentation

## Overview
Complete analytics and reporting system for teams generation across all matches, users, and games. Provides detailed insights into usage patterns, performance metrics, and revenue tracking.

---

## Endpoints

### 1. GET `/admin/reports/teams-analytics`
**Comprehensive teams generation analytics with filters**

#### Query Parameters
- `period` (optional): Number of days to analyze. Default: `7`
  - Examples: `?period=7`, `?period=30`, `?period=90`

#### Response Format
```json
{
  "success": true,
  "period_days": 7,
  "period_from": "2026-01-17",
  "period_to": "2026-01-24",
  
  "overall_stats": {
    "total_generations": 156,
    "unique_users": 89,
    "matches_used": 24,
    "game_types": 3,
    "avg_coins_per_gen": 45.5
  },
  
  "status_summary": {
    "successful": 150,
    "failed": 4,
    "cancelled": 2,
    "pending": 0,
    "success_rate": 97.4
  },
  
  "by_game_type": [
    {
      "game": "football",
      "generations": 89,
      "users": 56,
      "matches": 18,
      "avg_coins": 50
    },
    {
      "game": "cricket",
      "generations": 67,
      "users": 33,
      "matches": 6,
      "avg_coins": 40
    }
  ],
  
  "top_matches": [
    {
      "match_id": 5,
      "home_team": "Manchester United",
      "away_team": "Liverpool",
      "start_time": "2026-01-24T15:00:00Z",
      "teams_generated": 45,
      "unique_users": 32,
      "game_types": 2,
      "total_coins_spent": 2025,
      "avg_coins_per_team": 45
    }
  ],
  
  "top_users": [
    {
      "user_id": 42,
      "fullname": "John Doe",
      "country": "India",
      "teams_generated": 23,
      "matches_played": 8,
      "games_used": 2,
      "total_coins_spent": 1035,
      "avg_coins_per_team": 45,
      "last_generation": "2026-01-24T14:32:15Z"
    }
  ],
  
  "coins_distribution": {
    "min": 25,
    "max": 100,
    "avg": 45.5,
    "std_dev": 15.2
  },
  
  "country_distribution": [
    {
      "country": "India",
      "users": 45,
      "teams_generated": 98,
      "total_coins": 4410
    }
  ],
  
  "daily_trend": [
    {
      "date": "2026-01-24",
      "generations": 28,
      "users": 18,
      "coins_spent": 1260
    }
  ]
}
```

#### Use Cases
- 📊 Dashboard analytics
- 📈 Weekly/monthly performance reviews
- 💰 Revenue tracking by period
- 🎮 Game type popularity trends
- 🌍 Geographic distribution analysis
- 👥 Top performer identification

---

### 2. GET `/admin/reports/match/:matchId/teams`
**Detailed teams report for a specific match**

#### URL Parameters
- `matchId` (required): Match ID

#### Query Parameters
- `limit` (optional): Number of records per page. Default: `50`. Range: `1-100`
- `offset` (optional): Pagination offset. Default: `0`

#### Response Format
```json
{
  "success": true,
  "match": {
    "id": 5,
    "home_team": "Manchester United",
    "away_team": "Liverpool",
    "start_time": "2026-01-24T15:00:00Z",
    "status": "UPCOMING"
  },
  "stats": {
    "total_teams": 45,
    "unique_users": 32,
    "game_types": 2,
    "total_coins_spent": 2025
  },
  "teams": [
    {
      "id": 128,
      "user_id": 42,
      "fullname": "John Doe",
      "country": "India",
      "game": "football",
      "coins_spent": 45,
      "status": "success",
      "created_at": "2026-01-24T14:32:15Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 45
}
```

#### Use Cases
- 🔍 Match-specific analytics
- 📋 User list for a match
- 🎮 Game type breakdown by match
- 💰 Revenue by match
- ⏱️ Timeline of team generations

---

## Data Metrics Explained

### Overall Stats
| Metric | Meaning |
|--------|---------|
| `total_generations` | Total number of teams created |
| `unique_users` | Number of distinct users who created teams |
| `matches_used` | Number of distinct matches with team generations |
| `game_types` | Number of different game types used |
| `avg_coins_per_gen` | Average coins spent per team creation |

### Status Summary
| Status | Meaning |
|--------|---------|
| `successful` | Teams successfully generated and stored |
| `failed` | Generation failed (error during UCT API call) |
| `cancelled` | User cancelled the generation |
| `pending` | Generation in progress |
| `success_rate` | Percentage of successful generations |

### Coins Distribution
| Metric | Meaning |
|--------|---------|
| `min` | Minimum coins spent on any generation |
| `max` | Maximum coins spent on any generation |
| `avg` | Average coins per generation |
| `std_dev` | Standard deviation (measure of variability) |

---

## Database Queries Used

The reports are built from `match_generation_log` table which tracks:
```sql
- id: Unique generation ID
- user_id: User who created teams
- match_id: Match for which teams were created
- game: Game type (football, cricket, etc.)
- coins_spent: Coins consumed for generation
- status: success | failed | cancelled | pending
- created_at: Timestamp of generation
```

---

## Sample Usage

### Get 7-day analytics:
```bash
GET /api/admin/reports/teams-analytics?period=7
```

### Get 30-day analytics:
```bash
GET /api/admin/reports/teams-analytics?period=30
```

### Get teams for match #5:
```bash
GET /api/admin/reports/match/5/teams?limit=20&offset=0
```

### Get all teams for match #5 (paginated):
```bash
GET /api/admin/reports/match/5/teams?limit=50&offset=0
GET /api/admin/reports/match/5/teams?limit=50&offset=50
```

---

## Performance Insights

### Key Indicators to Monitor

1. **Success Rate**: Aim for >95%
   - If <95%, investigate UCT API issues

2. **Avg Coins Per Generation**: Should be stable
   - Sudden changes may indicate pricing updates

3. **Top Users**: Monitor for bots or abuse
   - Unusually high generations per user

4. **Game Type Distribution**: Track user preferences
   - Helps with game offerings

5. **Daily Trend**: Detect spikes or drops
   - Correlation with marketing campaigns

---

## Integration with Other Reports

- **Dashboard**: Uses overall_stats for KPI cards
- **Match Analytics**: Teams per match metric
- **User Reports**: Top users generation history
- **Revenue Reports**: Coins spent per period
- **Fraud Detection**: Unusual generation patterns

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 404 Not Found | Match ID doesn't exist | Verify match_id is valid |
| 500 Server Error | Database connection issue | Check database status |
| Invalid period | period < 1 or > 365 | Use valid day range |

---

## Rate Limiting
- No specific limits (inherited from admin middleware)
- Cache recommended for periods over 90 days

---

## Notes for Admin Dashboard Integration

1. **Real-time Updates**: Query with `period=1` for today's data
2. **Performance**: Consider caching daily_trend data
3. **Export**: JSON responses can be exported to CSV/Excel
4. **Alerts**: Set up alerts if:
   - Success rate drops below 90%
   - Daily generations < avg * 0.5
   - Coins spent per gen > avg * 2
