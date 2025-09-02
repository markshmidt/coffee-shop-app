# Personal diary

This document is describing my thoughts and feelings as well as the process of creating the application for fun and reflection purposes.

## Day 1

After finishing [Django Application Development with SQL and Databases](https://www.coursera.org/learn/developing-applications-with-sql-databases-and-django?specialization=ibm-full-stack-cloud-developer)
course I was willing to apply the knowledge I received and put it into something good for my portfolio, something that will level up my skills and make the software development journey more fun. 
Working as a barista, I quickly came up with an idea of POS machine app-simulator for my cafe. The one we use is outdated, complicated, with a lot of unnecessary buttons and overloaded structure.
I wanted to implement similar model, but with more user-friendly design, clear and coherent system and aim to show my Django skills.
During my evening shift, when we did not have many customers, I began to draw the class diagram on empty cheques.

## Day 2

Initial set up was created. I discussed with Chat GPT how to make the whole development more formal - like it was my real job to complete, like someone asked me to develop this app.
That is how deliverables were created. Some concepts were simplified - we do not need discount per item, when we can do discount per order (at least for now). 
First version of class diagram was created, then there are the models with simple fields that will expand later. There is a complete undesrtanding of the next steps.

## Day 3

Had a morning shift and some stuff to do before the college begin, so did not have much time for continuing development. Added some items, categories and groups to db.

## Day 4

Added Modifiers and Variants: every drink has one/two/three sizes and a price depends on that size, so there was a need to reflect this in db and then in UI. Was thinking of adding "modifiers"
like syrups, extra shots, milks, etc. as MenuItems (as they are also in the menu, they also have price) but decided to make it a separate table in db (might be changed in the future).
Had a first thought of this diary. Added all espresso drinks from the menu to db in order to have at least one totally completed section that can be used as a reference while dealing with UI.

## Day 5

Desided to implement partial UI before implementing session cart - it is easier to come with new concepts and understand the development proccess when you can see the practical result needed.
It did take a while to do the templates, though I had our cafe's app design in my phone, due to the fact that I wanted to make it better. 
However, the most difficult part was a) imagining future views b) applying JS in a way that parent categories are shown separate of subcategories 
(e.g. you see only hot drinks/cold drinks first, then click on hot drinks and see espresso drinks/teas/chocolates/etc). Don't like the final result completely, however, looks not that bad.
Might add a category like "most popular drinks" that would be default and showing most often bought items, but it would be implemented after statistics added to manager account and staff like that.

## Day 6.

For now, the most complicated part for me is integrating variants of items into template. After couple of hours filtering with js and trying to make prices look normal, I realized that MenuItems price_cents differs from Variant base_price_cents and that is why the price with ExpressionWrapper was not workinb. 
Similar problem with Modifiers: I want them to be different for different item groups (e.g. Food does not need to have "add syrup/extra shot", right?). I will change models again and attach groups to categories (perhaps items in the future?)
