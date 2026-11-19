/*
 * Bike share: riders hire e-bikes from city docks, and the operator's staff keep the fleet in service.
 * The operator's Structurizr workspace, as its teams keep it: its views are the C4 views of bike-share.json.
 */
workspace "Bike share" "Hires e-bikes from city docks." {

    !identifiers hierarchical

    model {
        rider = person "Rider" "Finds and hires bikes, pays for rides and reports faults."
        group "Field crews" {
            staff = person "Operations staff" "Keep the fleet in service and refund rides."
        }
        van = softwareSystem "Van service" "Collects faulty bikes and brings them back repaired." "External"

        bikeshare = softwareSystem "Bike share" "Hires e-bikes from city docks: finding, unlocking, pricing and paying for rides." {
            app = container "Rider app" "The rider's app: a map of bikes, unlock and ride history, and the admin pages for staff." "TypeScript, React" "Web Browser"
            api = container "Trip API" "Bikes, rides, pricing and accounts as a JSON API." "Python, FastAPI" {
                finder = component "Bike finder" "Lists and searches free bikes and docks." "FastAPI router"
                hire = component "Hire" "Turns an unlock into a paid ride." "FastAPI router"
                accounts = component "Accounts and sign-in" "Signs riders and staff in; keeps hashed passwords and sessions." "FastAPI router"
                payment-client = component "Payment client" "Starts card payments and reads their result." "Python, httpx"
                ride-store = component "Ride store" "Saves rides and puts the ended ones on the ride queue." "SQLAlchemy"
            }
            worker = container "Ride worker" "Closes ended rides: books a van for a faulty bike and sends the receipt." "Python"
            db = container "Database" "Bikes, docks, rides and accounts." "PostgreSQL" "Database"
            queue = container "Ride queue" "Ended rides waiting to be closed, oldest first." "PostgreSQL table" "Queue"
        }

        payments = softwareSystem "Payment provider" "Takes card payments and makes refunds." "External"
        mail = softwareSystem "Email service" "Delivers the operator's emails." "External"

        bikeshare.worker -> bikeshare.queue "Claims ended rides from" "SQL"
        bikeshare.worker -> bikeshare.db "Marks rides as closed in" "SQL"
        bikeshare.worker -> van "Books van pickups with" "HTTPS"
        bikeshare.worker -> mail "Sends receipts with" "HTTPS"
        mail -> rider "Delivers receipts to" "Email"
        rider -> bikeshare.app "Finds and unlocks a bike in" "HTTPS"
        staff -> bikeshare.app "Edit the fleet and refund rides in" "HTTPS"
        bikeshare.app -> bikeshare.api.finder "Finds bikes through" "JSON over HTTPS"
        bikeshare.app -> bikeshare.api.hire "Starts rides through" "JSON over HTTPS"
        bikeshare.app -> bikeshare.api.accounts "Signs in through" "JSON over HTTPS"
        bikeshare.api.hire -> bikeshare.api.payment-client "Charges the card through"
        bikeshare.api.payment-client -> payments "Starts a card payment with" "HTTPS"
        bikeshare.api.hire -> bikeshare.api.ride-store "Saves the paid ride with"
        bikeshare.api.ride-store -> bikeshare.db "Reads and writes rides in" "SQL"
        bikeshare.api.ride-store -> bikeshare.queue "Puts ended rides on" "SQL"
        bikeshare.api.finder -> bikeshare.db "Reads bikes and docks from" "SQL"
        bikeshare.api.accounts -> bikeshare.db "Reads and writes accounts and sessions in" "SQL"

        production = deploymentEnvironment "Production" {
            deploymentNode "User's device" "A rider's or a staff member's own device." "Laptop, tablet or phone" {
                deploymentNode "Web browser" "" "Chrome, Firefox, Safari or Edge" {
                    containerInstance bikeshare.app
                }
            }
            deploymentNode "Web server" "The web tier's server." "Ubuntu 24.04 LTS" {
                deploymentNode "Docker Compose" "" "Docker Engine 27" {
                    containerInstance bikeshare.api
                    containerInstance bikeshare.worker
                }
            }
            deploymentNode "Database server" "Backed up every night." "Ubuntu 24.04 LTS" {
                deploymentNode "PostgreSQL" "" "PostgreSQL 16" {
                    containerInstance bikeshare.db
                    containerInstance bikeshare.queue
                }
            }
        }
    }

    views {
        systemContext bikeshare "context" "Who hires bikes, who keeps them running, and what Bike share leans on." {
            include *
            autolayout lr
        }
        container bikeshare "containers" "The rider app, the trip API, the ride worker, and where rides wait." {
            include *
            autolayout lr
        }
        component bikeshare.api "api" "Inside the trip API." {
            include *
            autolayout lr
        }
        dynamic bikeshare "end-ride" "Ending a ride." {
            rider -> bikeshare.app "Ends the ride in"
            bikeshare.app -> bikeshare.api "Ends the ride through"
            bikeshare.api -> payments "Charges the card with"
            bikeshare.api -> bikeshare.db "Saves the ended ride in"
            bikeshare.api -> bikeshare.queue "Puts the ended ride on"
            bikeshare.worker -> bikeshare.queue "Claims the ended ride from"
            bikeshare.worker -> van "Books a pickup for a faulty bike with"
            bikeshare.worker -> mail "Sends the receipt with"
            mail -> rider "Delivers the receipt to"
            bikeshare.worker -> bikeshare.db "Marks the ride as closed in"
            autolayout lr
        }
        deployment * production "production" "Bike share in production." {
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
