/*
 * Moped share: riders hire e-mopeds from city docks, and the operator's staff keep the fleet in service.
 * The operator's Structurizr workspace, as its teams keep it: its views are the C4 views of integration.json.
 */
workspace "Moped share" "Hires e-mopeds from city docks." {

    !identifiers hierarchical

    model {
        rider = person "Rider" "Finds and hires mopeds, pays for rides and reports faults."
        group "Field crews" {
            staff = person "Operations staff" "Keep the fleet in service and refund rides."
        }
        van = softwareSystem "Van service" "Collects faulty mopeds and brings them back repaired." "External"

        mopedshare = softwareSystem "Moped share" "Hires e-mopeds from city docks: finding, unlocking, pricing and paying for rides." {
            app = container "Rider app" "The rider's app: a map of mopeds, unlock and ride history, and the admin pages for staff." "TypeScript, React" "Web Browser"
            api = container "Trip API" "Mopeds, rides, pricing and accounts as a JSON API." "Python, FastAPI" {
                finder = component "Moped finder" "Lists and searches free mopeds and docks." "FastAPI router"
                hire = component "Hire" "Turns an unlock into a paid ride." "FastAPI router"
                accounts = component "Accounts and sign-in" "Signs riders and staff in; keeps hashed passwords and sessions." "FastAPI router"
                payment-client = component "Payment client" "Starts card payments and reads their result." "Python, httpx"
                ride-store = component "Ride store" "Saves rides and puts the ended ones on the ride queue." "SQLAlchemy"
            }
            worker = container "Ride worker" "Closes ended rides: books a van for a faulty moped and sends the receipt." "Python"
            db = container "Database" "Mopeds, docks, rides and accounts." "PostgreSQL" "Database"
            queue = container "Ride queue" "Ended rides waiting to be closed, oldest first." "PostgreSQL table" "Queue"
        }

        payments = softwareSystem "Payment provider" "Takes card payments and makes refunds." "External"
        mail = softwareSystem "Email service" "Delivers the operator's emails." "External"

        mopedshare.worker -> mopedshare.queue "Claims ended rides from" "SQL"
        mopedshare.worker -> van "Books van pickups with" "HTTPS"
        mopedshare.worker -> mail "Sends receipts with" "HTTPS"
        mail -> rider "Delivers receipts to" "Email"
        rider -> mopedshare.app "Finds and unlocks a moped in" "HTTPS"
        staff -> mopedshare.app "Edit the fleet and refund rides in" "HTTPS"
        mopedshare.app -> mopedshare.api.accounts "Signs in through" "JSON over HTTPS"
        mopedshare.app -> mopedshare.api.finder "Finds mopeds through" "JSON over HTTPS"
        mopedshare.app -> mopedshare.api.hire "Starts rides through" "JSON over HTTPS"
        mopedshare.api.hire -> mopedshare.api.ride-store "Saves the paid ride with"
        mopedshare.api.hire -> mopedshare.api.payment-client "Charges the card through"
        mopedshare.api.payment-client -> payments "Starts a card payment with" "HTTPS"
        mopedshare.api.ride-store -> mopedshare.db "Reads and writes rides in" "SQL"
        mopedshare.api.ride-store -> mopedshare.queue "Puts ended rides on" "SQL"
        mopedshare.api.finder -> mopedshare.db "Reads mopeds and docks from" "SQL"
        mopedshare.api.accounts -> mopedshare.db "Reads and writes accounts and sessions in" "SQL"

        production = deploymentEnvironment "Production" {
            deploymentNode "User's device" "A rider's or a staff member's own device." "Laptop, tablet or phone" {
                deploymentNode "Web browser" "" "Chrome, Firefox, Safari or Edge" {
                    containerInstance mopedshare.app
                }
            }
            deploymentNode "Web server" "The web tier's server." "Ubuntu 24.04 LTS" {
                deploymentNode "Docker Compose" "" "Docker Engine 27" {
                    containerInstance mopedshare.api
                    containerInstance mopedshare.worker
                }
            }
            deploymentNode "Database server" "Backed up every night." "Ubuntu 24.04 LTS" {
                deploymentNode "PostgreSQL" "" "PostgreSQL 16" {
                    containerInstance mopedshare.db
                    containerInstance mopedshare.queue
                }
            }
        }
    }

    views {
        systemContext mopedshare "context" "Who hires mopeds, who keeps them running, and what Moped share leans on." {
            include *
            autolayout lr
        }
        container mopedshare "containers" "The rider app, the trip API, the ride worker, and where rides wait." {
            include *
            autolayout lr
        }
        component mopedshare.api "api" "Inside the trip API." {
            include *
            autolayout lr
        }
        dynamic mopedshare "end-ride" "Ending a ride." {
            rider -> mopedshare.app "Ends the ride in"
            mopedshare.app -> mopedshare.api "Ends the ride through"
            mopedshare.api -> payments "Charges the card with"
            mopedshare.api -> mopedshare.db "Saves the ended ride in"
            mopedshare.api -> mopedshare.queue "Puts the ended ride on"
            mopedshare.worker -> mopedshare.queue "Claims the ended ride from"
            mopedshare.worker -> van "Books a pickup for a faulty moped with"
            mopedshare.worker -> mail "Sends the receipt with"
            mail -> rider "Delivers the receipt to"
            autolayout lr
        }
        deployment * production "production" "Moped share in production." {
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
