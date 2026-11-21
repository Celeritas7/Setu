/* Supplied research handoff v1 JSON Schema. Kept local for offline validation. */
(function (root) {
  const schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.invalid/setu-research-handoff-v1.schema.json",
  "title": "Setu research handoff v1 (review-only)",
  "$comment": "Schema reference for developer chat; no remote fetch required. Not a production migration.",
  "type": "object",
  "required": [
    "format",
    "schema_version",
    "destination",
    "provenance",
    "import_contract",
    "hubs",
    "places"
  ],
  "properties": {
    "format": {
      "const": "setu_research_handoff"
    },
    "schema_version": {
      "const": "1.0.0"
    },
    "data_classification": {
      "type": "string"
    },
    "destination": {
      "type": "object",
      "required": [
        "origin_station_ja",
        "travel_date",
        "date_confirmed"
      ],
      "properties": {
        "origin_station_ja": {
          "type": "string"
        },
        "travel_date": {
          "type": [
            "string",
            "null"
          ]
        },
        "date_confirmed": {
          "type": "boolean"
        }
      }
    },
    "provenance": {
      "type": "object"
    },
    "import_contract": {
      "type": "object"
    },
    "hubs": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "id",
          "name_ja"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name_ja": {
            "type": "string"
          }
        }
      }
    },
    "places": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "research_id",
          "name_ja",
          "location",
          "hub_id",
          "research_fields",
          "tags",
          "source_links",
          "visit_status",
          "accepted_into_setu",
          "review_status"
        ],
        "properties": {
          "research_id": {
            "type": "string"
          },
          "name_ja": {
            "type": "string",
            "minLength": 1
          },
          "name_en": {
            "type": [
              "string",
              "null"
            ]
          },
          "location": {
            "type": "object",
            "required": [
              "address_ja",
              "coordinates",
              "maps_url"
            ],
            "properties": {
              "address_ja": {
                "type": "string"
              },
              "coordinates": {
                "type": [
                  "object",
                  "null"
                ]
              },
              "maps_url": {
                "type": "string",
                "pattern": "^https://"
              }
            }
          },
          "hub_id": {
            "type": "string"
          },
          "research_fields": {
            "type": "object",
            "required": [
              "cost",
              "hours",
              "access"
            ],
            "properties": {
              "cost": {
                "type": "object",
                "required": [
                  "raw_text",
                  "admission_yen",
                  "admission_evidence"
                ],
                "properties": {
                  "raw_text": {
                    "type": "string"
                  },
                  "admission_yen": {
                    "type": [
                      "integer",
                      "null"
                    ],
                    "minimum": 0
                  },
                  "admission_evidence": {
                    "type": "string"
                  }
                }
              },
              "hours": {
                "type": "object",
                "required": [
                  "raw_summary",
                  "weekly_intervals",
                  "date_specific_open"
                ],
                "properties": {
                  "raw_summary": {
                    "type": "string"
                  },
                  "weekly_intervals": {
                    "type": [
                      "object",
                      "null"
                    ]
                  },
                  "date_specific_open": {
                    "type": [
                      "boolean",
                      "null"
                    ]
                  }
                }
              },
              "access": {
                "type": "object"
              }
            }
          },
          "tags": {
            "type": "object",
            "required": [
              "practical_candidates",
              "experiential_candidates",
              "personal_confirmed_experiences"
            ],
            "properties": {
              "practical_candidates": {
                "type": "array"
              },
              "experiential_candidates": {
                "type": "array"
              },
              "personal_confirmed_experiences": {
                "type": "array",
                "maxItems": 0
              }
            }
          },
          "source_links": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": [
                "url",
                "checked_at"
              ],
              "properties": {
                "url": {
                  "type": "string",
                  "pattern": "^https?://"
                },
                "checked_at": {
                  "type": "string"
                }
              }
            }
          },
          "visit_status": {
            "const": "suggested"
          },
          "accepted_into_setu": {
            "const": false
          },
          "review_status": {
            "const": "not_reviewed"
          },
          "personal_observation": {
            "type": "null"
          }
        }
      }
    }
  }
};
  if (typeof module !== "undefined" && module.exports) module.exports = schema;
  else root.SetuResearchSchema = schema;
})(typeof globalThis !== "undefined" ? globalThis : this);
