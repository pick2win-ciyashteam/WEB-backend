// src/utils/uctApi.js
export const UCT_ENDPOINTS = {
  sorare:     `${process.env.UCT_BASE_URL}/uct-fb-sr/football-sorare/teams`,
  fanduel:    `${process.env.UCT_BASE_URL}/uct-fb-fd/football-fanduel/teams`,
  draftkings: `${process.env.UCT_BASE_URL}/uct-fb-dk/football-draftkings/teams`,
  football:   `${process.env.UCT_BASE_URL}/football/teams`,
};

export const getUCTEndpoint = (game) => {
  const key = String(game || "football").toLowerCase().trim();
  return UCT_ENDPOINTS[key] || UCT_ENDPOINTS.football;
};           

         