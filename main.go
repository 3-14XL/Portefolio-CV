package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path"
	"strings"
	"time"
)

// Chemins relatifs à la racine du projet : lance `go run main.go` depuis ce dossier.
const (
	indexPage = "./template/index-folio.html"
	formPage  = "./template/form.html"
	staticDir = "./statics"
)

// Link est un lien affiché en bas d'une carte projet (code source, démo, docs…).
// Un lien dont l'URL est vide n'est pas affiché : renseigne l'URL pour le faire apparaître.
type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
	Icon  string `json:"icon"` // classes Font Awesome, ex. "fab fa-github"
}

// Project décrit une carte de la galerie de la section « Projets Récents ».
type Project struct {
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle"` // sous le titre animé, sous la galerie
	Description string   `json:"description"`
	Icon        string   `json:"icon"` // classes Font Awesome de l'illustration
	Tech        []string `json:"tech"`
	Links       []Link   `json:"links"`
}

// loadProjects est le point d'entrée pour tes projets.
// Ici ils sont écrits en dur ; tu pourras les lire plus tard depuis un fichier JSON ou une base.
func loadProjects() []Project {
	return []Project{
		{
			Title:       "E-Commerce Dashboard",
			Subtitle:    "Application web",
			Description: "Une application de tableau de bord pour gérer les ventes et les inventaires en temps réel. Intègre des graphiques interactifs et une gestion d'utilisateurs.",
			Icon:        "fas fa-code",
			Tech:        []string{"React", "Firebase", "Chart.js"},
			Links: []Link{
				{Label: "Code source", URL: "", Icon: "fab fa-github"},
				{Label: "Démo en ligne", URL: "", Icon: "fas fa-external-link-alt"},
			},
		},
		{
			Title:       "Task Manager App",
			Subtitle:    "Application collaborative",
			Description: "Application de gestion de tâches collaborative avec authentification JWT et mises à jour en temps réel via WebSockets.",
			Icon:        "fas fa-mobile-alt",
			Tech:        []string{"Vue.js", "Node.js", "Socket.io"},
			Links: []Link{
				{Label: "Code source", URL: "", Icon: "fab fa-github"},
				{Label: "Démo en ligne", URL: "", Icon: "fas fa-external-link-alt"},
			},
		},
		{
			Title:       "API RESTful Weather",
			Subtitle:    "API REST",
			Description: "API robuste consommant des données météo externes, avec documentation Swagger et tests unitaires complets.",
			Icon:        "fas fa-cloud",
			Tech:        []string{"Python", "FastAPI", "Docker"},
			Links: []Link{
				{Label: "Code source", URL: "", Icon: "fab fa-github"},
				{Label: "Documentation", URL: "", Icon: "fas fa-book"},
			},
		},
	}
}

func projectsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	if err := json.NewEncoder(w).Encode(loadProjects()); err != nil {
		log.Printf("encodage JSON : %v", err)
	}
}

// servePage renvoie un fichier HTML précis, uniquement pour l'adresse demandée.
func servePage(route, file string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != route {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, file)
	}
}

// noListFS empêche http.FileServer d'afficher la liste des fichiers d'un dossier.
type noListFS struct{ fs http.FileSystem }

func (n noListFS) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if st.IsDir() {
		index, err := n.fs.Open(path.Join(name, "index.html"))
		if err != nil {
			f.Close()
			return nil, os.ErrNotExist
		}
		index.Close()
	}
	return f, nil
}

func mustExist(p string) {
	if _, err := os.Stat(p); err != nil {
		log.Fatalf("introuvable : %s (%v)\nLance le serveur depuis la racine du projet, là où se trouve main.go.", p, err)
	}
}

func main() {
	mustExist(indexPage)
	mustExist(staticDir)

	static := http.StripPrefix("/statics/", http.FileServer(noListFS{http.Dir(staticDir)}))

	mux := http.NewServeMux()
	mux.HandleFunc("/", servePage("/", indexPage))
	mux.HandleFunc("/form", servePage("/form", formPage))
	mux.HandleFunc("/api/projects", projectsHandler)
	mux.HandleFunc("/statics/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache") // le navigateur revérifie : tes modifications CSS/JS apparaissent au rechargement
		static.ServeHTTP(w, r)
	})

	addr := ":8080"
	if v := os.Getenv("ADDR"); v != "" {
		addr = v
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	host := addr
	if strings.HasPrefix(addr, ":") {
		host = "localhost" + addr
	}
	log.Printf("Serveur démarré sur http://%s", host)
	log.Fatal(srv.ListenAndServe())
}
