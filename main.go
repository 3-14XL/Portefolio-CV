package main

import (
	"log"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/3-14XL/Portefolio-CV/projects"
)

// Chemins relatifs à la racine du projet : lance `go run main.go` depuis ce dossier.
// En production (Vercel), ce fichier n'est pas utilisé : voir vercel.json et api/projects.go.
const (
	indexPage = "./template/index-folio.html"
	formPage  = "./template/form.html"
	staticDir = "./statics"
)

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
		log.Fatalf("not found: %s (%v)\nStart the server from the root of the project (where you can find main.go).", p, err)
	}
}

func main() {
	mustExist(indexPage)
	mustExist(staticDir)

	go projects.List() // charge la liste dès le démarrage : la première visite n'attend pas GitHub

	static := http.StripPrefix("/statics/", http.FileServer(noListFS{http.Dir(staticDir)}))

	mux := http.NewServeMux()
	mux.HandleFunc("/", servePage("/", indexPage))
	mux.HandleFunc("/form", servePage("/form", formPage))
	mux.HandleFunc("/api/projects", projects.Handler)
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
	log.Printf("Server loaded on http://%s", host)
	log.Fatal(srv.ListenAndServe())
}
