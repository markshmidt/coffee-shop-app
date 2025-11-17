# Coffee Island POS — [https://mariia-shmidt-portfolio.com/coffeeshopapp/](https://mariia-shmidt-portfolio.com/coffeeshopapp/)

A full-stack Point of Sale (POS) web application built with Django, designed for Coffee Island coffee shop, but suitable for all small similar businesses.
It provides order management, item configuration, categories, variants, loyalty points, receipt handling, and more.

### This project includes:

- A fully functional Django backend

- Custom business logic (pricing, modifiers, discounts, loyalty program)

- Docker containerization

- Automated linting & build pipeline using GitHub Actions CI/CD

- Detailed documentation (ERD, class diagrams, Postman collection, SRS-style docs)

## Features
POS & Order Management: 
- Add items with modifiers & options & variants to session-based cart;
- Automatic pricing calculation in cart
- Assigning existing customer to cart (saving in session) and to order (saving to db), as well as creating new one
- Discounts & loyalty points applied
- Creating & managing customer orders with opportunity to write order notes and print receipts

Admin:
- CRUD for menu categories, items, variants
- Customer management
- Users/user groups and permissions management
- Order history w/ search and filters

## Technical Features and Stack

- Django 5.x
- Sqlite3
- HTML + CSS + JavaScript for frontend
- Gunicorn + nginx deployment
- Ruff for linting and static analysis
- Fully Dockerized for easy deployment
- GitHub Actions CI/CD pipeline
- File logging & session support
- Static and media file management

## System design
See the [ERD & Class Diagram](docs/erd.md).

## Project Structure
## Project Structure
coffee-shop-app/    
│   
├── coffeeshop/               # Django project root     
│   ├── coffeshop/            # Settings, wsgi, urls    
│   ├── store/                # Main POS app    
│   │   ├── migrations/     
│   │   ├── services/         #cart, loyalty and pricing management     
│   │   ├── static/     
│   │   ├── templates/      
│   │   ├── views/  
│   │   ├── utils/            #json parsers and serializers     
│   │   ├── admin.py    
│   │   ├── models.py   
│   │   ├── permissions.py  
│   │   ├── tests.py    
│   │   ├── urls.py     
│   ├── logs/                 # Runtime logs (created automatically)    
│   ├── media/                # Uploaded files (runtime)        
│   └── requirements.txt
│       
├── data/                     # SQLite DB   
│   └── db.sqlite3  
│       
├── docs/                     # Project documentation   
│   ├── diagrams/             # ERD + class diagrams    
│   ├── [01-product-onepager.md](docs/01-product-onepager.md)   
│   ├── [02-policies.md](docs/02-policies.md)   
│   ├── [03-acceptance-checklist.md](docs/03-acceptance-checklist.md)   
│   ├── [Coffeeshop.postman_collection.json](Coffeeshop.postman_collection.json)    
│   ├── [personal-journey.md](personal-journey.md)  
│   └── erd.md  
│   
├── Dockerfile                   
├── .dockerignore   
├── .gitignore  
└── README.md   

## Planned Improvements

- Better UI change
- Refund feature
- Docker Compose with nginx + gunicorn for deployment
- Replace SQLite with PostgreSQL
- Automated tests (pytest + Django test suite)
- Dedicated manager dashboard with data analytics, daily sales reports, etc. and CRUD for models
- Send email receipts to customer


