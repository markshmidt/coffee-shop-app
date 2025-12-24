# Coffee Island POS — [https://mariia-shmidt-portfolio.com/coffeeshopapp/](https://mariia-shmidt-portfolio.com/coffeeshopapp/login/)

A full-stack Point of Sale (POS) web application built with Django, designed for Coffee Island coffee shop, but suitable for all small similar businesses.
It provides order management, item configuration, categories, variants, loyalty points, receipt handling, analytics dashboard and more.
<img width="1918" height="1066" alt="image" src="https://github.com/user-attachments/assets/4aeb74d8-ee8e-4b8a-b3b8-9efa16b136c2" /> 

### This project includes:

- A fully functional Django backend

- Custom business logic (pricing, modifiers, discounts, loyalty program)

- Docker containerization

- Automated linting & build pipeline using GitHub Actions CI/CD

- Detailed documentation (ERD, class diagrams, Postman collection, SRS-style docs)

## Features
POS & Order Management:
- Add items with modifiers, options, and variants to a session-based cart
- Automatic pricing calculation (modifiers, discounts, tax, rounding)
- Assign existing customers to cart or create new customers on checkout
- Loyalty points earning & redemption
- Order creation with internal notes
- Receipt rendering and printing
- Refund functionality (manager-only) with accounting-safe behavior

Admin & Management:

- CRUD for menu categories, items, variants, and modifiers
- Customer management
- Order history with status tracking (Paid / Completed / Refunded)

## Analytics & Reporting

The application includes a live analytics dashboard available at /analytics/

Analytics are computed directly from the Order & OrderItem tables using Django ORM aggregation and Python data processing.

### Implemented analytics include:
- Global / All-Time Metrics
- Total number of orders

- Total revenue (excluding refunded orders)

- Number of refunded orders

- Refund rate (%)

- Payment method split (Cash vs Card)

- Daily revenue & order count by hour

- Monthly revenue totals

- Cumulative revenue for the current month

- Average revenue per day

- New customers per period

- Top customer (by total spend)

- Average order value

- Orders per customer


- Most popular items (by quantity sold)

- Least popular items

- Top 5 drinks (all time)

- Bottom 5 drinks (all time)
- Opportunity to export orders to CSV for accounting or Excel analysis
- Ability to generate monthly analytics PDF reports containing KPIs and charts

## Technical Features and Stack

- Django 5.x
- Sqlite3
- HTML + CSS + JavaScript for frontend
- Gunicorn + nginx deployment
- Pandas — data analysis & aggregation
- NumPy — numerical processing
- Matplotlib — static charts
- Seaborn — statistical visualizations
- Chart.js/Plotly.js — interactive frontend charts
- Ruff for linting and static analysis
- Fully Dockerized for easy deployment
- GitHub Actions CI/CD pipeline
- File logging & session support
- Static and media file management

## System design
See the [ERD & Class Diagram](docs/erd.md).

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

- Docker Compose with nginx + gunicorn for deployment
- Replace SQLite with PostgreSQL
- Automated tests (pytest + Django test suite)
- Send email receipts to customer
- Jenkins for deployment


