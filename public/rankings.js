// UK overall rankings, 2027 editions. Sources and retrieval date are stored per list.
// Names are mapped explicitly to UCAS providers; ties retain their published rank.
const RANKING_LISTS = {
  "qs": {
    "title": "QS World University Rankings \u00b7 UK",
    "year": 2027,
    "source": "https://issc.co.uk/uk-university-rankings/qs/default.asp?year=2027qs",
    "publisher": "https://www.topuniversities.com/world-university-rankings",
    "checked": "2026-10-02",
    "note": "UK positions derived from QS world ranks; universities QS lists without a rank are left out.",
    "entries": [
      {
        "rank": 1,
        "tied": false,
        "label": "Imperial College London",
        "name": "Imperial College London",
        "world": 2
      },
      {
        "rank": 2,
        "tied": false,
        "label": "Oxford",
        "name": "University of Oxford",
        "world": 4
      },
      {
        "rank": 3,
        "tied": false,
        "label": "Cambridge",
        "name": "University of Cambridge",
        "world": 6
      },
      {
        "rank": 4,
        "tied": false,
        "label": "UCL",
        "name": "UCL (University College London)",
        "world": 8
      },
      {
        "rank": 5,
        "tied": false,
        "label": "Edinburgh",
        "name": "The University of Edinburgh",
        "world": 35
      },
      {
        "rank": 6,
        "tied": false,
        "label": "King\u2019s College London",
        "name": "King's College London, University of London",
        "world": 37
      },
      {
        "rank": 7,
        "tied": false,
        "label": "Manchester",
        "name": "University of Manchester",
        "world": 40
      },
      {
        "rank": 8,
        "tied": false,
        "label": "Bristol",
        "name": "University of Bristol",
        "world": 57
      },
      {
        "rank": 9,
        "tied": false,
        "label": "LSE",
        "name": "London School of Economics and Political Science, University of London",
        "world": 62
      },
      {
        "rank": 10,
        "tied": true,
        "label": "Warwick",
        "name": "University of Warwick",
        "world": 68
      },
      {
        "rank": 10,
        "tied": true,
        "label": "Birmingham",
        "name": "University of Birmingham",
        "world": 68
      },
      {
        "rank": 12,
        "tied": false,
        "label": "Leeds",
        "name": "University of Leeds",
        "world": 77
      },
      {
        "rank": 13,
        "tied": false,
        "label": "Glasgow",
        "name": "University of Glasgow",
        "world": 80
      },
      {
        "rank": 14,
        "tied": false,
        "label": "Sheffield",
        "name": "University of Sheffield",
        "world": 82
      },
      {
        "rank": 15,
        "tied": false,
        "label": "Durham",
        "name": "Durham University",
        "world": 85
      },
      {
        "rank": 16,
        "tied": false,
        "label": "Nottingham",
        "name": "University of Nottingham",
        "world": 97
      },
      {
        "rank": 17,
        "tied": false,
        "label": "Queen Mary, London",
        "name": "Queen Mary University of London",
        "world": 103
      },
      {
        "rank": 18,
        "tied": false,
        "label": "Southampton",
        "name": "University of Southampton",
        "world": 111
      },
      {
        "rank": 19,
        "tied": false,
        "label": "St Andrews",
        "name": "University of St Andrews",
        "world": 115
      },
      {
        "rank": 20,
        "tied": false,
        "label": "Bath",
        "name": "University of Bath",
        "world": 125
      },
      {
        "rank": 21,
        "tied": false,
        "label": "Exeter",
        "name": "University of Exeter",
        "world": 136
      },
      {
        "rank": 22,
        "tied": false,
        "label": "Liverpool",
        "name": "University of Liverpool",
        "world": 139
      },
      {
        "rank": 23,
        "tied": false,
        "label": "Newcastle",
        "name": "Newcastle University",
        "world": 149
      },
      {
        "rank": 24,
        "tied": false,
        "label": "York",
        "name": "University of York",
        "world": 158
      },
      {
        "rank": 25,
        "tied": false,
        "label": "Lancaster",
        "name": "Lancaster University",
        "world": 164
      },
      {
        "rank": 26,
        "tied": false,
        "label": "Queen\u2019s Belfast",
        "name": "Queen's University Belfast",
        "world": 174
      },
      {
        "rank": 27,
        "tied": false,
        "label": "Cardiff",
        "name": "Cardiff University",
        "world": 179
      },
      {
        "rank": 28,
        "tied": false,
        "label": "Reading",
        "name": "University of Reading",
        "world": 196
      },
      {
        "rank": 29,
        "tied": false,
        "label": "Loughborough",
        "name": "Loughborough University",
        "world": 203
      },
      {
        "rank": 30,
        "tied": false,
        "label": "Strathclyde",
        "name": "University of Strathclyde",
        "world": 230
      },
      {
        "rank": 31,
        "tied": false,
        "label": "Surrey",
        "name": "University of Surrey",
        "world": 246
      },
      {
        "rank": 32,
        "tied": false,
        "label": "Sussex",
        "name": "University of Sussex",
        "world": 273
      },
      {
        "rank": 33,
        "tied": false,
        "label": "Aberdeen",
        "name": "University of Aberdeen",
        "world": 288
      },
      {
        "rank": 34,
        "tied": false,
        "label": "Leicester",
        "name": "University of Leicester",
        "world": 314
      },
      {
        "rank": 35,
        "tied": false,
        "label": "Swansea",
        "name": "Swansea University",
        "world": 322
      },
      {
        "rank": 36,
        "tied": false,
        "label": "Heriot-Watt",
        "name": "Heriot-Watt University",
        "world": 325
      },
      {
        "rank": 37,
        "tied": false,
        "label": "Brunel",
        "name": "Brunel University of London",
        "world": 353
      },
      {
        "rank": 38,
        "tied": false,
        "label": "Birkbeck",
        "name": "Birkbeck, University of London",
        "world": 354
      },
      {
        "rank": 39,
        "tied": false,
        "label": "City St George's, University of London",
        "name": "City St George's, University of London",
        "world": 361
      },
      {
        "rank": 40,
        "tied": false,
        "label": "East Anglia UEA",
        "name": "University of East Anglia UEA",
        "world": 381
      },
      {
        "rank": 41,
        "tied": false,
        "label": "Oxford Brookes",
        "name": "Oxford Brookes University",
        "world": 411
      },
      {
        "rank": 42,
        "tied": false,
        "label": "Kent",
        "name": "University of Kent",
        "world": 415
      },
      {
        "rank": 43,
        "tied": false,
        "label": "Aston University, Birmingham",
        "name": "Aston University, Birmingham",
        "world": 416
      },
      {
        "rank": 44,
        "tied": false,
        "label": "Essex",
        "name": "University of Essex",
        "world": 438
      },
      {
        "rank": 45,
        "tied": false,
        "label": "Dundee",
        "name": "University of Dundee",
        "world": 447
      },
      {
        "rank": 46,
        "tied": false,
        "label": "SOAS",
        "name": "SOAS University of London",
        "world": 458
      },
      {
        "rank": 47,
        "tied": false,
        "label": "Royal Holloway",
        "name": "Royal Holloway, University of London",
        "world": 485
      },
      {
        "rank": 48,
        "tied": false,
        "label": "Bradford",
        "name": "University of Bradford",
        "world": 497
      },
      {
        "rank": 49,
        "tied": false,
        "label": "Huddersfield",
        "name": "University of Huddersfield",
        "world": 521
      },
      {
        "rank": 50,
        "tied": false,
        "label": "Northumbria",
        "name": "Northumbria University, Newcastle",
        "world": 528
      },
      {
        "rank": 51,
        "tied": false,
        "label": "Stirling",
        "name": "University of Stirling",
        "world": 560
      },
      {
        "rank": 52,
        "tied": false,
        "label": "Bangor",
        "name": "Bangor University",
        "world": 567
      },
      {
        "rank": 53,
        "tied": false,
        "label": "Hull",
        "name": "University of Hull",
        "world": 575
      },
      {
        "rank": 54,
        "tied": false,
        "label": "Coventry",
        "name": "Coventry University",
        "world": 581
      },
      {
        "rank": 55,
        "tied": false,
        "label": "Ulster",
        "name": "Ulster University",
        "world": 595
      },
      {
        "rank": 56,
        "tied": false,
        "label": "Manchester Metropolitan",
        "name": "Manchester Metropolitan University",
        "world": 600
      },
      {
        "rank": 57,
        "tied": false,
        "label": "Nottingham Trent",
        "name": "Nottingham Trent University",
        "world": 639
      },
      {
        "rank": 58,
        "tied": false,
        "label": "Portsmouth",
        "name": "University of Portsmouth",
        "world": 662
      },
      {
        "rank": 59,
        "tied": false,
        "label": "Kingston",
        "name": "Kingston University",
        "world": 686
      },
      {
        "rank": 60,
        "tied": false,
        "label": "Plymouth",
        "name": "University of Plymouth",
        "world": 691
      }
    ]
  },
  "times": {
    "title": "The Times & Sunday Times Good University Guide",
    "year": 2027,
    "source": "https://issc.co.uk/uk-university-rankings/times/default.asp?year=2027",
    "publisher": "https://www.thetimes.com/best-universities-league-table",
    "checked": "2026-10-01",
    "entries": [
      {
        "rank": 1,
        "tied": false,
        "label": "St Andrews",
        "name": "University of St Andrews"
      },
      {
        "rank": 2,
        "tied": false,
        "label": "LSE",
        "name": "London School of Economics and Political Science, University of London"
      },
      {
        "rank": 3,
        "tied": false,
        "label": "Imperial College London",
        "name": "Imperial College London"
      },
      {
        "rank": 4,
        "tied": false,
        "label": "Cambridge",
        "name": "University of Cambridge"
      },
      {
        "rank": 5,
        "tied": false,
        "label": "Oxford",
        "name": "University of Oxford"
      },
      {
        "rank": 6,
        "tied": false,
        "label": "Durham",
        "name": "Durham University"
      },
      {
        "rank": 7,
        "tied": false,
        "label": "Warwick",
        "name": "University of Warwick"
      },
      {
        "rank": 8,
        "tied": false,
        "label": "Bath",
        "name": "University of Bath"
      },
      {
        "rank": 9,
        "tied": false,
        "label": "Strathclyde",
        "name": "University of Strathclyde"
      },
      {
        "rank": 10,
        "tied": false,
        "label": "Bristol",
        "name": "University of Bristol"
      },
      {
        "rank": 11,
        "tied": false,
        "label": "Sheffield",
        "name": "University of Sheffield"
      },
      {
        "rank": 12,
        "tied": false,
        "label": "Birmingham",
        "name": "University of Birmingham"
      },
      {
        "rank": 13,
        "tied": false,
        "label": "Loughborough",
        "name": "Loughborough University"
      },
      {
        "rank": 14,
        "tied": false,
        "label": "UCL",
        "name": "UCL (University College London)"
      },
      {
        "rank": 15,
        "tied": false,
        "label": "Glasgow",
        "name": "University of Glasgow"
      },
      {
        "rank": 16,
        "tied": false,
        "label": "Exeter",
        "name": "University of Exeter"
      },
      {
        "rank": 17,
        "tied": false,
        "label": "Edinburgh",
        "name": "The University of Edinburgh"
      },
      {
        "rank": 18,
        "tied": true,
        "label": "Southampton",
        "name": "University of Southampton"
      },
      {
        "rank": 18,
        "tied": true,
        "label": "York",
        "name": "University of York"
      },
      {
        "rank": 20,
        "tied": false,
        "label": "Dundee",
        "name": "University of Dundee"
      },
      {
        "rank": 21,
        "tied": false,
        "label": "Liverpool",
        "name": "University of Liverpool"
      },
      {
        "rank": 22,
        "tied": false,
        "label": "Leeds",
        "name": "University of Leeds"
      },
      {
        "rank": 23,
        "tied": false,
        "label": "Manchester",
        "name": "University of Manchester"
      },
      {
        "rank": 24,
        "tied": false,
        "label": "Nottingham",
        "name": "University of Nottingham"
      },
      {
        "rank": 25,
        "tied": false,
        "label": "Surrey",
        "name": "University of Surrey"
      },
      {
        "rank": 26,
        "tied": false,
        "label": "Lancaster",
        "name": "Lancaster University"
      },
      {
        "rank": 27,
        "tied": false,
        "label": "Queen\u2019s Belfast",
        "name": "Queen's University Belfast"
      },
      {
        "rank": 28,
        "tied": false,
        "label": "Aberdeen",
        "name": "University of Aberdeen"
      },
      {
        "rank": 29,
        "tied": false,
        "label": "King\u2019s College London",
        "name": "King's College London, University of London"
      },
      {
        "rank": 30,
        "tied": false,
        "label": "Newcastle",
        "name": "Newcastle University"
      },
      {
        "rank": 31,
        "tied": false,
        "label": "Leicester",
        "name": "University of Leicester"
      },
      {
        "rank": 32,
        "tied": false,
        "label": "Cardiff",
        "name": "Cardiff University"
      },
      {
        "rank": 33,
        "tied": false,
        "label": "Royal Holloway",
        "name": "Royal Holloway, University of London"
      },
      {
        "rank": 34,
        "tied": false,
        "label": "Ulster",
        "name": "Ulster University"
      },
      {
        "rank": 35,
        "tied": false,
        "label": "Reading",
        "name": "University of Reading"
      },
      {
        "rank": 36,
        "tied": false,
        "label": "Queen Mary, London",
        "name": "Queen Mary University of London"
      },
      {
        "rank": 37,
        "tied": false,
        "label": "Stirling",
        "name": "University of Stirling"
      },
      {
        "rank": 38,
        "tied": true,
        "label": "Swansea",
        "name": "Swansea University"
      },
      {
        "rank": 38,
        "tied": true,
        "label": "Manchester Metropolitan",
        "name": "Manchester Metropolitan University"
      },
      {
        "rank": 40,
        "tied": false,
        "label": "East Anglia UEA",
        "name": "University of East Anglia UEA"
      },
      {
        "rank": 41,
        "tied": false,
        "label": "Heriot-Watt",
        "name": "Heriot-Watt University"
      },
      {
        "rank": 42,
        "tied": false,
        "label": "Edinburgh Napier",
        "name": "Edinburgh Napier University"
      },
      {
        "rank": 43,
        "tied": false,
        "label": "Glasgow Caledonian",
        "name": "Glasgow Caledonian University"
      },
      {
        "rank": 44,
        "tied": true,
        "label": "the Arts London",
        "name": "University of the Arts London"
      },
      {
        "rank": 44,
        "tied": true,
        "label": "Nottingham Trent",
        "name": "Nottingham Trent University"
      },
      {
        "rank": 46,
        "tied": false,
        "label": "Keele",
        "name": "Keele University"
      },
      {
        "rank": 47,
        "tied": true,
        "label": "Sussex",
        "name": "University of Sussex"
      },
      {
        "rank": 47,
        "tied": true,
        "label": "Essex",
        "name": "University of Essex"
      },
      {
        "rank": 49,
        "tied": false,
        "label": "Aston University, Birmingham",
        "name": "Aston University, Birmingham"
      },
      {
        "rank": 50,
        "tied": false,
        "label": "Hull",
        "name": "University of Hull"
      },
      {
        "rank": 51,
        "tied": false,
        "label": "Staffordshire",
        "name": "University of Staffordshire"
      },
      {
        "rank": 52,
        "tied": false,
        "label": "Northumbria",
        "name": "Northumbria University, Newcastle"
      },
      {
        "rank": 53,
        "tied": false,
        "label": "Bangor",
        "name": "Bangor University"
      },
      {
        "rank": 54,
        "tied": false,
        "label": "Liverpool John Moores",
        "name": "Liverpool John Moores University"
      },
      {
        "rank": 55,
        "tied": false,
        "label": "Robert Gordon",
        "name": "Robert Gordon University"
      },
      {
        "rank": 56,
        "tied": false,
        "label": "City St George's, University of London",
        "name": "City St George's, University of London"
      },
      {
        "rank": 57,
        "tied": false,
        "label": "Chichester",
        "name": "University of Chichester"
      },
      {
        "rank": 58,
        "tied": false,
        "label": "East London",
        "name": "University of East London"
      },
      {
        "rank": 59,
        "tied": false,
        "label": "Hertfordshire",
        "name": "University of Hertfordshire"
      },
      {
        "rank": 60,
        "tied": false,
        "label": "Abertay",
        "name": "Abertay University"
      },
      {
        "rank": 61,
        "tied": false,
        "label": "Portsmouth",
        "name": "University of Portsmouth"
      },
      {
        "rank": 62,
        "tied": false,
        "label": "Lincoln",
        "name": "University of Lincoln"
      },
      {
        "rank": 63,
        "tied": false,
        "label": "Aberystwyth",
        "name": "Aberystwyth University"
      },
      {
        "rank": 64,
        "tied": false,
        "label": "Kent",
        "name": "University of Kent"
      },
      {
        "rank": 65,
        "tied": false,
        "label": "the West of England (UWE Bristol)",
        "name": "Bristol, UWE"
      },
      {
        "rank": 66,
        "tied": false,
        "label": "Queen Margaret University, Edinburgh",
        "name": "Queen Margaret University, Edinburgh"
      },
      {
        "rank": 67,
        "tied": false,
        "label": "Harper Adams",
        "name": "Harper Adams University"
      },
      {
        "rank": 68,
        "tied": false,
        "label": "Teesside",
        "name": "Teesside University"
      },
      {
        "rank": 69,
        "tied": false,
        "label": "Plymouth",
        "name": "University of Plymouth"
      },
      {
        "rank": 70,
        "tied": false,
        "label": "Edge Hill",
        "name": "Edge Hill University"
      },
      {
        "rank": 71,
        "tied": false,
        "label": "Coventry",
        "name": "Coventry University"
      },
      {
        "rank": 72,
        "tied": false,
        "label": "Hartpury University and Hartpury College",
        "name": "Hartpury University"
      },
      {
        "rank": 73,
        "tied": false,
        "label": "Leeds Beckett",
        "name": "Leeds Beckett University"
      },
      {
        "rank": 74,
        "tied": false,
        "label": "Norwich University of the Arts",
        "name": "Norwich University of the Arts"
      },
      {
        "rank": 75,
        "tied": true,
        "label": "South Wales",
        "name": "University of South Wales"
      },
      {
        "rank": 75,
        "tied": true,
        "label": "West London",
        "name": "University of West London"
      },
      {
        "rank": 77,
        "tied": false,
        "label": "Brighton",
        "name": "University of Brighton"
      },
      {
        "rank": 78,
        "tied": true,
        "label": "Kingston",
        "name": "Kingston University"
      },
      {
        "rank": 78,
        "tied": true,
        "label": "Cardiff Metropolitan",
        "name": "Cardiff Metropolitan University"
      },
      {
        "rank": 80,
        "tied": false,
        "label": "Birmingham Newman",
        "name": "Birmingham Newman University"
      },
      {
        "rank": 81,
        "tied": false,
        "label": "Salford",
        "name": "University of Salford"
      },
      {
        "rank": 82,
        "tied": false,
        "label": "Goldsmiths, University of London",
        "name": "Goldsmiths, University of London"
      },
      {
        "rank": 83,
        "tied": false,
        "label": "Sheffield Hallam",
        "name": "Sheffield Hallam University"
      },
      {
        "rank": 84,
        "tied": true,
        "label": "Liverpool Hope",
        "name": "Liverpool Hope University"
      },
      {
        "rank": 84,
        "tied": true,
        "label": "Roehampton",
        "name": "University of Roehampton"
      },
      {
        "rank": 86,
        "tied": false,
        "label": "Winchester",
        "name": "University of Winchester"
      },
      {
        "rank": 87,
        "tied": false,
        "label": "De Montfort",
        "name": "De Montfort University"
      },
      {
        "rank": 88,
        "tied": false,
        "label": "the West of Scotland",
        "name": "University of the West of Scotland"
      },
      {
        "rank": 89,
        "tied": false,
        "label": "Falmouth",
        "name": "Falmouth University"
      },
      {
        "rank": 90,
        "tied": false,
        "label": "Bishop Grosseteste",
        "name": "Lincoln Bishop University"
      },
      {
        "rank": 91,
        "tied": false,
        "label": "Middlesex",
        "name": "Middlesex University"
      },
      {
        "rank": 92,
        "tied": false,
        "label": "Chester",
        "name": "University of Chester"
      },
      {
        "rank": 93,
        "tied": false,
        "label": "Bradford",
        "name": "University of Bradford"
      },
      {
        "rank": 94,
        "tied": false,
        "label": "London South Bank",
        "name": "London South Bank University"
      },
      {
        "rank": 95,
        "tied": false,
        "label": "Huddersfield",
        "name": "University of Huddersfield"
      },
      {
        "rank": 96,
        "tied": false,
        "label": "Derby",
        "name": "University of Derby"
      },
      {
        "rank": 97,
        "tied": false,
        "label": "Wales Trinity Saint David",
        "name": "University of Wales Trinity Saint David"
      },
      {
        "rank": 98,
        "tied": false,
        "label": "Worcester",
        "name": "University of Worcester"
      },
      {
        "rank": 99,
        "tied": false,
        "label": "Birmingham City",
        "name": "Birmingham City University"
      },
      {
        "rank": 100,
        "tied": false,
        "label": "Central Lancashire",
        "name": "University of Lancashire"
      }
    ]
  },
  "guardian": {
    "title": "Guardian University Guide",
    "year": 2027,
    "source": "https://cfeuk.com/the-guardian-university-guide-2027/",
    "publisher": "https://www.theguardian.com/education/ng-interactive/2026/sep/12/the-guardian-university-guide-2027-the-rankings",
    "checked": "2026-10-01",
    "entries": [
      {
        "rank": 1,
        "tied": false,
        "label": "Oxford",
        "name": "University of Oxford"
      },
      {
        "rank": 2,
        "tied": false,
        "label": "Cambridge",
        "name": "University of Cambridge"
      },
      {
        "rank": 3,
        "tied": false,
        "label": "LSE",
        "name": "London School of Economics and Political Science, University of London"
      },
      {
        "rank": 4,
        "tied": false,
        "label": "St Andrews",
        "name": "University of St Andrews"
      },
      {
        "rank": 5,
        "tied": false,
        "label": "Imperial College London",
        "name": "Imperial College London"
      },
      {
        "rank": 6,
        "tied": false,
        "label": "Durham",
        "name": "Durham University"
      },
      {
        "rank": 7,
        "tied": false,
        "label": "Warwick",
        "name": "University of Warwick"
      },
      {
        "rank": 8,
        "tied": false,
        "label": "Bath",
        "name": "University of Bath"
      },
      {
        "rank": 9,
        "tied": false,
        "label": "Loughborough",
        "name": "Loughborough University"
      },
      {
        "rank": 10,
        "tied": false,
        "label": "the Arts London",
        "name": "University of the Arts London"
      },
      {
        "rank": 11,
        "tied": false,
        "label": "Edinburgh",
        "name": "The University of Edinburgh"
      },
      {
        "rank": 12,
        "tied": false,
        "label": "Bristol",
        "name": "University of Bristol"
      },
      {
        "rank": 13,
        "tied": false,
        "label": "UCL",
        "name": "UCL (University College London)"
      },
      {
        "rank": 14,
        "tied": false,
        "label": "Birmingham",
        "name": "University of Birmingham"
      },
      {
        "rank": 15,
        "tied": false,
        "label": "Sheffield",
        "name": "University of Sheffield"
      },
      {
        "rank": 16,
        "tied": false,
        "label": "Exeter",
        "name": "University of Exeter"
      },
      {
        "rank": 17,
        "tied": false,
        "label": "Strathclyde",
        "name": "University of Strathclyde"
      },
      {
        "rank": 18,
        "tied": false,
        "label": "Southampton",
        "name": "University of Southampton"
      },
      {
        "rank": 19,
        "tied": false,
        "label": "King\u2019s College London",
        "name": "King's College London, University of London"
      },
      {
        "rank": 20,
        "tied": false,
        "label": "Manchester",
        "name": "University of Manchester"
      },
      {
        "rank": 21,
        "tied": true,
        "label": "Glasgow",
        "name": "University of Glasgow"
      },
      {
        "rank": 21,
        "tied": true,
        "label": "Dundee",
        "name": "University of Dundee"
      },
      {
        "rank": 23,
        "tied": false,
        "label": "Essex",
        "name": "University of Essex"
      },
      {
        "rank": 24,
        "tied": false,
        "label": "South Wales",
        "name": "University of South Wales"
      },
      {
        "rank": 25,
        "tied": false,
        "label": "Swansea",
        "name": "Swansea University"
      },
      {
        "rank": 26,
        "tied": false,
        "label": "Leeds",
        "name": "University of Leeds"
      },
      {
        "rank": 27,
        "tied": false,
        "label": "Lancaster",
        "name": "Lancaster University"
      },
      {
        "rank": 28,
        "tied": false,
        "label": "Nottingham Trent",
        "name": "Nottingham Trent University"
      },
      {
        "rank": 29,
        "tied": false,
        "label": "Heriot-Watt",
        "name": "Heriot-Watt University"
      },
      {
        "rank": 30,
        "tied": false,
        "label": "Liverpool",
        "name": "University of Liverpool"
      },
      {
        "rank": 31,
        "tied": false,
        "label": "Chichester",
        "name": "University of Chichester"
      },
      {
        "rank": 32,
        "tied": false,
        "label": "Teesside",
        "name": "Teesside University"
      },
      {
        "rank": 33,
        "tied": false,
        "label": "Derby",
        "name": "University of Derby"
      },
      {
        "rank": 34,
        "tied": false,
        "label": "Staffordshire",
        "name": "University of Staffordshire"
      },
      {
        "rank": 35,
        "tied": false,
        "label": "Birmingham Newman",
        "name": "Birmingham Newman University"
      },
      {
        "rank": 36,
        "tied": false,
        "label": "Portsmouth",
        "name": "University of Portsmouth"
      },
      {
        "rank": 37,
        "tied": true,
        "label": "East London",
        "name": "University of East London"
      },
      {
        "rank": 37,
        "tied": true,
        "label": "Hertfordshire",
        "name": "University of Hertfordshire"
      },
      {
        "rank": 39,
        "tied": true,
        "label": "Surrey",
        "name": "University of Surrey"
      },
      {
        "rank": 39,
        "tied": true,
        "label": "Leicester",
        "name": "University of Leicester"
      },
      {
        "rank": 41,
        "tied": false,
        "label": "Manchester Metropolitan",
        "name": "Manchester Metropolitan University"
      },
      {
        "rank": 42,
        "tied": false,
        "label": "Norwich University of the Arts",
        "name": "Norwich University of the Arts"
      },
      {
        "rank": 43,
        "tied": true,
        "label": "Queen\u2019s Belfast",
        "name": "Queen's University Belfast"
      },
      {
        "rank": 43,
        "tied": true,
        "label": "Cardiff",
        "name": "Cardiff University"
      },
      {
        "rank": 45,
        "tied": false,
        "label": "Bristol, UWE",
        "name": "Bristol, UWE"
      },
      {
        "rank": 46,
        "tied": false,
        "label": "York",
        "name": "University of York"
      },
      {
        "rank": 47,
        "tied": true,
        "label": "West London",
        "name": "University of West London"
      },
      {
        "rank": 47,
        "tied": true,
        "label": "Sussex",
        "name": "University of Sussex"
      },
      {
        "rank": 47,
        "tied": true,
        "label": "Wales Trinity Saint David",
        "name": "University of Wales Trinity Saint David"
      },
      {
        "rank": 50,
        "tied": false,
        "label": "Aberdeen",
        "name": "University of Aberdeen"
      },
      {
        "rank": 51,
        "tied": true,
        "label": "Nottingham",
        "name": "University of Nottingham"
      },
      {
        "rank": 51,
        "tied": true,
        "label": "Bradford",
        "name": "University of Bradford"
      },
      {
        "rank": 53,
        "tied": false,
        "label": "Liverpool John Moores",
        "name": "Liverpool John Moores University"
      },
      {
        "rank": 54,
        "tied": false,
        "label": "Queen Mary",
        "name": "Queen Mary University of London"
      },
      {
        "rank": 55,
        "tied": true,
        "label": "Keele",
        "name": "Keele University"
      },
      {
        "rank": 55,
        "tied": true,
        "label": "Reading",
        "name": "University of Reading"
      },
      {
        "rank": 57,
        "tied": false,
        "label": "Salford",
        "name": "University of Salford"
      },
      {
        "rank": 58,
        "tied": false,
        "label": "Ulster",
        "name": "Ulster University"
      },
      {
        "rank": 59,
        "tied": false,
        "label": "Bath Spa",
        "name": "Bath Spa University"
      },
      {
        "rank": 60,
        "tied": false,
        "label": "Edge Hill",
        "name": "Edge Hill University"
      },
      {
        "rank": 61,
        "tied": false,
        "label": "Chester",
        "name": "University of Chester"
      },
      {
        "rank": 62,
        "tied": false,
        "label": "Kingston",
        "name": "Kingston University"
      },
      {
        "rank": 63,
        "tied": false,
        "label": "Northumbria",
        "name": "Northumbria University, Newcastle"
      },
      {
        "rank": 64,
        "tied": false,
        "label": "Bangor",
        "name": "Bangor University"
      },
      {
        "rank": 65,
        "tied": false,
        "label": "Abertay",
        "name": "Abertay University"
      },
      {
        "rank": 66,
        "tied": false,
        "label": "Arts University Bournemouth",
        "name": "Arts University Bournemouth"
      },
      {
        "rank": 67,
        "tied": true,
        "label": "London Met",
        "name": "London Metropolitan University"
      },
      {
        "rank": 67,
        "tied": true,
        "label": "Solent",
        "name": "Southampton, Solent University"
      },
      {
        "rank": 67,
        "tied": true,
        "label": "Wolverhampton",
        "name": "University of Wolverhampton"
      },
      {
        "rank": 70,
        "tied": false,
        "label": "Bucks New",
        "name": "Bucks New University"
      },
      {
        "rank": 71,
        "tied": true,
        "label": "Hull",
        "name": "University of Hull"
      },
      {
        "rank": 71,
        "tied": true,
        "label": "Aston",
        "name": "Aston University, Birmingham"
      },
      {
        "rank": 73,
        "tied": true,
        "label": "Canterbury Christ Church",
        "name": "Canterbury Christ Church University"
      },
      {
        "rank": 73,
        "tied": true,
        "label": "University for the Creative Arts",
        "name": "University for the Creative Arts"
      },
      {
        "rank": 73,
        "tied": true,
        "label": "Gloucestershire",
        "name": "University of Gloucestershire"
      },
      {
        "rank": 73,
        "tied": true,
        "label": "Sunderland",
        "name": "University of Sunderland"
      },
      {
        "rank": 77,
        "tied": false,
        "label": "Lancashire",
        "name": "University of Lancashire"
      },
      {
        "rank": 78,
        "tied": true,
        "label": "Royal Holloway",
        "name": "Royal Holloway, University of London"
      },
      {
        "rank": 78,
        "tied": true,
        "label": "Northampton",
        "name": "University of Northampton"
      },
      {
        "rank": 80,
        "tied": false,
        "label": "Oxford Brookes",
        "name": "Oxford Brookes University"
      },
      {
        "rank": 81,
        "tied": false,
        "label": "Falmouth",
        "name": "Falmouth University"
      },
      {
        "rank": 82,
        "tied": false,
        "label": "Newcastle",
        "name": "Newcastle University"
      },
      {
        "rank": 83,
        "tied": false,
        "label": "London South Bank",
        "name": "London South Bank University"
      },
      {
        "rank": 84,
        "tied": false,
        "label": "Plymouth",
        "name": "University of Plymouth"
      },
      {
        "rank": 85,
        "tied": false,
        "label": "De Montfort",
        "name": "De Montfort University"
      },
      {
        "rank": 86,
        "tied": true,
        "label": "Lincoln",
        "name": "University of Lincoln"
      },
      {
        "rank": 86,
        "tied": true,
        "label": "UEA",
        "name": "University of East Anglia UEA"
      },
      {
        "rank": 88,
        "tied": false,
        "label": "Goldsmiths",
        "name": "Goldsmiths, University of London"
      },
      {
        "rank": 89,
        "tied": false,
        "label": "Cardiff Met",
        "name": "Cardiff Metropolitan University"
      },
      {
        "rank": 90,
        "tied": false,
        "label": "Bedfordshire",
        "name": "University of Bedfordshire"
      },
      {
        "rank": 91,
        "tied": false,
        "label": "Edinburgh Napier",
        "name": "Edinburgh Napier University"
      },
      {
        "rank": 92,
        "tied": true,
        "label": "Leeds Trinity",
        "name": "Leeds Trinity University"
      },
      {
        "rank": 92,
        "tied": true,
        "label": "Stirling",
        "name": "University of Stirling"
      },
      {
        "rank": 94,
        "tied": false,
        "label": "Robert Gordon",
        "name": "Robert Gordon University"
      },
      {
        "rank": 95,
        "tied": false,
        "label": "Liverpool Hope",
        "name": "Liverpool Hope University"
      },
      {
        "rank": 96,
        "tied": false,
        "label": "Coventry",
        "name": "Coventry University"
      },
      {
        "rank": 97,
        "tied": false,
        "label": "Leeds Beckett",
        "name": "Leeds Beckett University"
      },
      {
        "rank": 98,
        "tied": false,
        "label": "Aberystwyth",
        "name": "Aberystwyth University"
      },
      {
        "rank": 99,
        "tied": false,
        "label": "Brunel",
        "name": "Brunel University of London"
      },
      {
        "rank": 100,
        "tied": true,
        "label": "Anglia Ruskin",
        "name": "Anglia Ruskin University"
      },
      {
        "rank": 100,
        "tied": true,
        "label": "Sheffield Hallam",
        "name": "Sheffield Hallam University"
      }
    ]
  }
};
