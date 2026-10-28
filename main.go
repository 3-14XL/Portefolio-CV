package main

import (
	"log"
	"net/http"
)

func main() {
	// Définir le répertoire contenant les fichiers statiques (form.html)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./template/form.html")
	})

	// Démarrer le serveur sur localhost:8080
	log.Println("Serveur démarré sur http://localhost:8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}
