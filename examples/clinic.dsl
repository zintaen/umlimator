/*
 * Clinic bookings: patients book online, reception runs the day.
 * A made-up system, written as a team would keep it in Structurizr.
 */
workspace "Clinic bookings" "Online appointments for a group of clinics" {

    !identifiers hierarchical

    model {
        patient = person "Patient" "Books and moves appointments."
        reception = person "Receptionist" "Runs a clinic's front desk."

        bookings = softwareSystem "Clinic bookings" "Appointments for every clinic in the group." {
            group "Apps" {
                web = container "Booking site" "Where patients book." "React" "Web Browser"
                desk = container "Front desk app" "Reception's view of the day." "React" "Web Browser"
            }
            api = container "Booking API" "Slots, bookings and changes." "Go" {
                slots = component "Slot finder" "Free slots per clinician." "Go"
                book = component "Booking handler" "Books, moves and cancels." "Go"
                remind = component "Reminder scheduler" "Queues a reminder a day ahead." "Go"
                store = component "Booking repository" "Reads and writes bookings." "Go, pgx"
            }
            db = container "Bookings database" "Clinicians, slots and bookings." "PostgreSQL" "Database"
            jobs = container "Job queue" "Reminders waiting to be sent." "RabbitMQ" "Queue"
            sender = container "Reminder sender" "Sends each reminder." "Python"
        }

        sms = softwareSystem "SMS gateway" "Delivers text messages." "External"
        records = softwareSystem "Patient records" "The group's medical records." "External"

        patient -> bookings.web "Books appointments" "HTTPS"
        reception -> bookings.desk "Manages the day" "HTTPS"
        bookings.web -> bookings.api.book "Books" "JSON/HTTPS"
        bookings.desk -> bookings.api.book "Moves and cancels" "JSON/HTTPS"
        bookings.api.book -> bookings.api.slots "Finds a free slot"
        bookings.api.slots -> bookings.api.store "Reads slots"
        bookings.api.book -> bookings.api.store "Saves bookings"
        bookings.api.book -> bookings.api.remind "Booked"
        bookings.api.book -> records "Checks the patient" "FHIR"
        bookings.api.store -> bookings.db "Reads and writes" "SQL"
        bookings.api.remind -> bookings.jobs "Queues reminders" "AMQP"
        bookings.sender -> bookings.jobs "Takes reminders" "AMQP"
        bookings.sender -> sms "Sends texts" "HTTPS"
        sms -> patient "Texts a reminder"

        live = deploymentEnvironment "Live" {
            deploymentNode "Cloud" {
                containerInstance bookings.api
            }
        }
    }

    views {
        systemContext bookings "context" "Who books, and what the bookings system leans on." {
            include *
            autolayout lr
        }
        container bookings "containers" "The apps, the API, and where bookings and reminders wait." {
            include *
            autolayout lr
        }
        component bookings.api "api" "Inside the booking API." {
            include *
            autolayout lr
        }
        styles {
            element "Person" {
                shape person
            }
            element "Database" {
                shape cylinder
            }
        }
        theme default
    }
}
